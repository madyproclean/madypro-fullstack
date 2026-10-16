import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AttendanceEntity, AttendanceStatus } from './entities/attendance.entity';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { UsersService } from '../users/users.service';
import { SitesService } from '../sites/sites.service';
import { CreateManualAttendanceDto } from './dto/create-manual.dto';
import { RegularizeAttendanceDto } from './dto/regularize-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { CancelAttendanceDto } from './dto/cancel-attendance.dto';
import { AuditService } from '../audit/audit.service';
import { MarkArrivalDto } from './dto/mark-arrival.dto';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { SettingsService } from '../settings/settings.service';
import { checkAttendanceCompleteness } from '../interventions/attendance-completeness.util';

type AttendanceFilters = {
  startDate?: string;
  endDate?: string;
  userId?: string;
  interventionId?: string;
  status?: AttendanceStatus | 'all';
  page?: number;
  pageSize?: number;
  /** Restreint aux pointages des interventions de ces sites (périmètre superviseur). */
  siteIds?: string[] | null;
};

type AttendanceView = {
  id: string;
  date: string;
  agent: { id: string; name: string };
  site: { id: string; name: string };
  interventionId?: string;
  checkInTime?: string;
  checkOutTime?: string;
  plannedStart?: string;
  plannedEnd?: string;
  durationMinutes?: number;
  status: AttendanceStatus;
  manual: boolean;
  createdBy: string;
  note?: string;
  gps: {
    checkIn?: { latitude: number; longitude: number; distanceMeters?: number };
    checkOut?: { latitude: number; longitude: number; distanceMeters?: number };
  };
  checkInPhoto?: string;
  checkOutPhoto?: string;
};

type AttendanceRecord = Prisma.AttendanceGetPayload<{}>;

@Injectable()
export class AttendanceService implements OnModuleInit {
  private readonly logger = new Logger(AttendanceService.name);
  private readonly MAX_DISTANCE_METERS = 100;

  /** Rayon GPS toléré : surcharge du site si définie, sinon réglage global, sinon valeur par défaut. */
  private resolveMaxDistance(site: { gpsDistanceMeters?: number | null } | null | undefined): number {
    return (
      site?.gpsDistanceMeters ??
      this.settingsService.getSettings().attendanceRules.gpsDistanceMeters ??
      this.MAX_DISTANCE_METERS
    );
  }

  private readonly OUTSIDE_GRACE_MS = 5 * 60 * 1000;
  private TIME_DRIFT_MS = 60 * 60 * 1000; // 60 minutes tolérance hors créneau
  private START_REMINDER_MS = 5 * 60 * 1000;
  private readonly startReminderSent = new Set<string>(); // attendanceId
  private readonly lateNotified = new Set<string>(); // interventionId:userId

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly sitesService: SitesService,
    private readonly auditService: AuditService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly settingsService: SettingsService,
  ) {}

  onModuleInit() {
    const startReminderMinutes = Number(process.env.START_REMINDER_MINUTES ?? '5');
    if (Number.isFinite(startReminderMinutes) && startReminderMinutes > 0) {
      this.START_REMINDER_MS = startReminderMinutes * 60 * 1000;
    }
    const timeDriftMinutes = Number(process.env.TIME_DRIFT_MINUTES ?? '60');
    if (Number.isFinite(timeDriftMinutes) && timeDriftMinutes >= 0) {
      this.TIME_DRIFT_MS = timeDriftMinutes * 60 * 1000;
    }
    setInterval(() => {
      this.checkOutsideAgents().catch((err) => console.warn('Drift monitor error', err));
    }, 20 * 60 * 1000);

    // Relance si présence enregistrée mais intervention non démarrée
    setInterval(() => {
      this.remindPendingStart().catch((err) => this.logger.warn('Relance start error', err));
    }, 2 * 60 * 1000);

    // Alerte superviseur si un agent n'a pas démarré au-delà de la tolérance
    setInterval(() => {
      this.notifyLateAgents().catch((err) => this.logger.warn('Alerte retard error', err));
    }, 3 * 60 * 1000);
  }

  private toDateOnly(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private endOfDay(value: string) {
    return new Date(`${value}T23:59:59.999Z`);
  }

  /**
   * Rappelle aux agents ayant enregistré leur présence mais pas démarré l'intervention.
   */
  private async remindPendingStart() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - this.START_REMINDER_MS);
    const dayStart = this.toDateOnly(now.toISOString().slice(0, 10));
    const dayEnd = this.endOfDay(now.toISOString().slice(0, 10));

    const pending = await this.prisma.attendance.findMany({
      where: {
        status: 'PENDING',
        arrivalTime: { not: null, lte: cutoff },
        checkInTime: null,
        date: { gte: dayStart, lte: dayEnd },
      },
      select: { id: true, userId: true, interventionId: true, arrivalTime: true },
    });

    if (pending.length) {
      this.logger.log(`[Push] Relance start: ${pending.length} attendances à relancer`);
    }

    for (const att of pending) {
      if (this.startReminderSent.has(att.id)) continue;
      this.startReminderSent.add(att.id);
      try {
        await this.notifications.send({
          audience: 'AGENT',
          targetId: att.userId,
          title: "Intervention à démarrer",
          message: "Présence enregistrée : pensez à démarrer l'intervention.",
        } as any);
      } catch (err) {
        this.logger.warn(
          `Relance start échouée (${att.id} -> ${att.userId}): ${err?.message || err}`,
        );
      }
    }

    // Nettoyage des clés anciennes pour éviter la croissance du set
    if (this.startReminderSent.size) {
      const stillPendingIds = new Set(pending.map((p) => p.id));
      for (const key of Array.from(this.startReminderSent)) {
        if (!stillPendingIds.has(key)) {
          this.startReminderSent.delete(key);
        }
      }
    }
  }

  /**
   * Alerte les superviseurs d'un site quand un agent assigné n'a pas démarré
   * son intervention au-delà de la tolérance horaire configurée.
   */
  private async notifyLateAgents() {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const dayStart = this.toDateOnly(todayStr);
    const dayEnd = this.endOfDay(todayStr);
    const defaultToleranceMinutes = this.settingsService.getSettings().attendanceRules.toleranceMinutes ?? 10;

    const interventions = await this.prisma.intervention.findMany({
      where: {
        date: { gte: dayStart, lte: dayEnd },
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      include: {
        assignments: true,
        attendances: true,
        site: { include: { supervisors: true } },
      },
    });

    // Un agent dont l'absence est validée pour ce jour n'est pas « en retard » : son
    // remplacement relève de la mission non couverte, pas d'une alerte de retard.
    const assignedIds = [...new Set(interventions.flatMap((i) => i.assignments.map((a) => a.userId)))];
    const absentIds = new Set(
      assignedIds.length
        ? (
            await this.prisma.absence.findMany({
              where: { userId: { in: assignedIds }, status: 'APPROVED', from: { lte: dayEnd }, to: { gte: dayStart } },
              select: { userId: true },
            })
          ).map((a) => a.userId)
        : [],
    );

    for (const intervention of interventions) {
      if (!intervention.assignments.length) continue;
      const toleranceMinutes = (intervention.site as any).toleranceMinutes ?? defaultToleranceMinutes;
      const plannedStart = this.combine(todayStr, intervention.startTime ?? '00:00');
      const lateSince = new Date(plannedStart.getTime() + toleranceMinutes * 60 * 1000);
      if (now < lateSince) continue;

      const supervisorIds = intervention.site.supervisors.map((s) => s.userId);
      if (!supervisorIds.length) continue;

      for (const assignment of intervention.assignments) {
        const key = `${intervention.id}:${assignment.userId}`;
        if (this.lateNotified.has(key) || absentIds.has(assignment.userId)) continue;
        const attendance = intervention.attendances.find((a) => a.userId === assignment.userId);
        if (attendance?.checkInTime) continue;
        this.lateNotified.add(key);

        const agentName = this.usersService.findOne(assignment.userId)?.name ?? 'Un agent';
        for (const supervisorId of supervisorIds) {
          try {
            await this.notifications.send({
              audience: 'AGENT',
              targetId: supervisorId,
              title: 'Retard sur intervention',
              message: `${agentName} n'a pas démarré "${intervention.site.name}" (prévu ${intervention.startTime}).`,
              category: 'late',
              // Ouvre la mission concernée sur la tablette superviseur.
              data: { interventionId: intervention.id },
            } as any);
          } catch (err: any) {
            this.logger.warn(`Alerte retard échouée (${key} -> superviseur ${supervisorId}): ${err?.message || err}`);
          }
        }
      }
    }

    if (this.lateNotified.size) {
      const stillTracked = new Set(
        interventions.flatMap((i) => i.assignments.map((a) => `${i.id}:${a.userId}`)),
      );
      for (const key of Array.from(this.lateNotified)) {
        if (!stillTracked.has(key)) {
          this.lateNotified.delete(key);
        }
      }
    }
  }

  private toEntity(record: AttendanceRecord): AttendanceEntity {
    const r: any = record as any;
    const base: AttendanceEntity = {
      id: record.id,
      userId: record.userId,
      arrivalTime: r.arrivalTime ?? undefined,
      arrivalLocation:
        r.arrivalLatitude != null && r.arrivalLongitude != null
          ? { latitude: r.arrivalLatitude, longitude: r.arrivalLongitude }
          : undefined,
      plannedStart: record.plannedStart ?? undefined,
      plannedEnd: record.plannedEnd ?? undefined,
      checkIn: record.checkInTime ?? undefined,
      checkOut: record.checkOutTime ?? undefined,
      checkInLocation:
        record.checkInLatitude != null && record.checkInLongitude != null
          ? { latitude: record.checkInLatitude, longitude: record.checkInLongitude }
          : undefined,
      checkOutLocation:
        record.checkOutLatitude != null && record.checkOutLongitude != null
          ? { latitude: record.checkOutLatitude, longitude: record.checkOutLongitude }
          : undefined,
      checkInPhoto: r.checkInPhoto ?? undefined,
      checkOutPhoto: r.checkOutPhoto ?? undefined,
      status: record.status,
      interventionId: record.interventionId!,
      note: record.note ?? undefined,
      manual: record.manual,
      createdBy: record.createdBy as 'AGENT' | 'SUPERVISOR' | 'ADMIN',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lastSeenAt: r.lastSeenAt ?? undefined,
      lastSeenLocation:
        r.lastSeenLatitude != null && r.lastSeenLongitude != null
          ? { latitude: r.lastSeenLatitude, longitude: r.lastSeenLongitude }
          : undefined,
      outsideSince: r.outsideSince ?? undefined,
    };
    if (r.interventionId) {
      base.interventionId = r.interventionId;
    }
    return base;
  }

  private async getRecord(id: string) {
    const record = await this.prisma.attendance.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException('Pointage introuvable');
    }
    return record;
  }

  private async toView(record: AttendanceEntity): Promise<AttendanceView> {
    const user = this.usersService.findOne(record.userId);
    const intervention = await this.prisma.intervention.findUnique({
      where: { id: record.interventionId },
      include: { site: true },
    });
    const siteRaw = intervention?.site ?? { id: '', name: '' };
    const site: any = {
      id: siteRaw.id,
      name: (siteRaw as any).name ?? '',
      latitude: (siteRaw as any).latitude ?? null,
      longitude: (siteRaw as any).longitude ?? null,
      supervisorIds: (siteRaw as any).supervisorIds ?? [],
    };
    const durationMinutes =
      record.checkIn && record.checkOut
        ? Math.max(0, Math.round((record.checkOut.getTime() - record.checkIn.getTime()) / 60000))
        : undefined;

    return {
      id: record.id,
      date: this.formatDate(record.checkIn ?? record.plannedStart ?? record.createdAt),
      agent: { id: user?.id ?? record.userId, name: user?.name ?? 'Agent inconnu' },
      site: { id: site.id, name: site.name },
      interventionId: record.interventionId,
      checkInTime: this.formatTime(record.checkIn),
      checkOutTime: this.formatTime(record.checkOut),
      plannedStart: this.formatTime(record.plannedStart),
      plannedEnd: this.formatTime(record.plannedEnd),
      durationMinutes,
      status: record.status,
      manual: record.manual,
      createdBy: record.createdBy,
      note: record.note,
      gps: {
        checkIn: record.checkInLocation
          ? {
              ...record.checkInLocation,
              distanceMeters: this.computeDistance(record.checkInLocation, site),
            }
          : undefined,
        checkOut: record.checkOutLocation
          ? {
              ...record.checkOutLocation,
              distanceMeters: this.computeDistance(record.checkOutLocation, site),
            }
          : undefined,
      },
      checkInPhoto: record.checkInPhoto,
      checkOutPhoto: record.checkOutPhoto,
    };
  }

  async list(filters: AttendanceFilters = {}) {
    const where: Prisma.AttendanceWhereInput = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.interventionId) where.interventionId = filters.interventionId;
    if (filters.siteIds) where.intervention = { siteId: { in: filters.siteIds } };
    if (filters.status && filters.status !== 'all') where.status = filters.status;
    if (filters.startDate || filters.endDate) {
      where.date = {};
      if (filters.startDate) where.date.gte = this.toDateOnly(filters.startDate);
      if (filters.endDate) where.date.lte = this.endOfDay(filters.endDate);
    }

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const [records, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: { user: true, intervention: { include: { site: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.attendance.count({ where }),
    ]);
    return {
      items: await Promise.all(records.map((record) => this.toView(this.toEntity(record as any)))),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string) {
    const record = await this.getRecord(id);
    return this.toView(this.toEntity(record));
  }

  async createManual(dto: CreateManualAttendanceDto) {
    const intervention = dto.interventionId
      ? await this.prisma.intervention.findUnique({
          where: { id: dto.interventionId },
          include: { site: true },
        })
      : null;
    const site = intervention?.site ?? this.sitesService.findOne(dto.siteId);
    const date = this.toDateOnly(dto.date);
    const endOfDay = this.endOfDay(dto.date);
    const checkIn = this.combine(dto.date, dto.checkInTime);
    const checkOut = dto.checkOutTime ? this.combine(dto.date, dto.checkOutTime) : null;
    const status: AttendanceStatus = checkOut ? 'COMPLETED' : 'PENDING';
    const createdBy = dto.createdByUserId ?? dto.createdBy ?? 'SUPERVISOR';

    const existing = await this.prisma.attendance.findFirst({
      where: {
        userId: dto.userId,
        interventionId: dto.interventionId ?? undefined,
        date: { gte: date, lte: endOfDay },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data: any = {
      userId: dto.userId,
      interventionId: dto.interventionId ?? undefined,
      date,
      checkInTime: checkIn,
      checkOutTime: checkOut,
      plannedStart: checkIn,
      plannedEnd: checkOut ?? checkIn,
      status,
      manual: true,
      createdBy,
      note: dto.note,
    };

    const record = existing
      ? await this.prisma.attendance.update({ where: { id: existing.id }, data })
      : await this.prisma.attendance.create({ data });

    await this.updateInterventionStatus(dto.userId, date, status, dto.interventionId);
    this.auditService.record({
      actorId: createdBy,
      action: 'CREATE_MANUAL_ATTENDANCE',
      entityType: 'attendance',
      entityId: record.id,
      details: `${dto.userId} ${dto.date}`,
    });
    return this.toView(this.toEntity(record));
  }

  async update(id: string, dto: UpdateAttendanceDto, actorId = 'admin@madyproclean.com') {
    const current = this.toEntity(await this.getRecord(id));
    const data: Prisma.AttendanceUpdateInput = {};
    if (dto.checkInTime) {
      const base = current.checkIn ?? current.plannedStart ?? current.createdAt;
      data.checkInTime = this.combine(this.formatDate(base), dto.checkInTime);
    }
    if (dto.checkOutTime) {
      const base = current.checkOut ?? current.checkIn ?? current.plannedEnd ?? current.createdAt;
      data.checkOutTime = this.combine(this.formatDate(base), dto.checkOutTime);
    }
    if (dto.note !== undefined) {
      data.note = dto.note;
    }
    if (dto.status) {
      data.status = dto.status;
    } else if (dto.checkOutTime && current.status === 'PENDING') {
      // Une correction manuelle d'horaire (admin/superviseur) qui renseigne l'heure de fin
      // équivaut à un check-out : sans ça le statut reste PENDING malgré des horaires complets,
      // ce qui bloque à tort la validation de l'intervention (agent vu comme "encore en cours").
      data.status = 'COMPLETED';
    }
    if (dto.interventionId) {
      data.intervention = { connect: { id: dto.interventionId } };
    }

    const record = await this.prisma.attendance.update({
      where: { id },
      data,
    });
    this.auditService.record({
      actorId,
      action: 'UPDATE_ATTENDANCE',
      entityType: 'attendance',
      entityId: id,
      details: 'Modification horaires',
    });
    return this.toView(this.toEntity(record));
  }

  /**
   * Régularisation d'un pointage (oubli, badge en panne…) : heures saisies par le superviseur, motif
   * obligatoire, ancienne et nouvelle valeur gardées dans le journal d'audit.
   */
  async regularize(id: string, dto: RegularizeAttendanceDto, actor: { id: string; name?: string }) {
    const record = await this.getRecord(id);
    if (!dto.checkInTime && !dto.checkOutTime) {
      throw new BadRequestException('Indiquez au moins une heure à corriger');
    }
    if (record.status === 'CANCELLED') {
      throw new BadRequestException('Ce pointage est annulé');
    }
    const day = record.date.toISOString().slice(0, 10);
    const checkIn = dto.checkInTime ? this.combine(day, dto.checkInTime) : record.checkInTime ?? record.arrivalTime;
    let checkOut = dto.checkOutTime ? this.combine(day, dto.checkOutTime) : record.checkOutTime;
    // Mission de nuit : une fin plus tôt que le début tombe le lendemain.
    if (checkIn && checkOut && checkOut <= checkIn && dto.checkOutTime) {
      checkOut = new Date(checkOut.getTime() + 24 * 60 * 60 * 1000);
    }
    if (checkIn && checkOut && checkOut <= checkIn) {
      throw new BadRequestException("L'heure de fin doit être après l'heure de début");
    }
    if (checkOut && checkOut.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new BadRequestException("L'heure de fin ne peut pas être dans le futur");
    }
    const reason = dto.reason.trim();
    const stamp = `Régularisé par ${actor.name ?? this.usersService.findOne(actor.id)?.name ?? 'le superviseur'} : ${reason}`;
    const updated = await this.prisma.attendance.update({
      where: { id },
      data: {
        checkInTime: checkIn ?? null,
        checkOutTime: checkOut ?? null,
        status: checkIn && checkOut ? 'COMPLETED' : record.status,
        manual: true,
        note: record.note ? `${record.note}\n${stamp}` : stamp,
      },
    });
    const clock = (d?: Date | null) => (d ? this.formatTime(d) ?? null : null);
    this.auditService.record({
      actorId: actor.id,
      action: 'UPDATE_ATTENDANCE',
      entityType: 'attendance',
      entityId: id,
      before: { checkIn: clock(record.checkInTime ?? record.arrivalTime), checkOut: clock(record.checkOutTime) },
      after: { checkIn: clock(updated.checkInTime), checkOut: clock(updated.checkOutTime) },
      details: `Régularisation : ${reason}`,
    });
    return this.toView(this.toEntity(updated));
  }

  async cancel(id: string, dto: CancelAttendanceDto) {
    const current = this.toEntity(await this.getRecord(id));
    const note = dto.reason
      ? current.note
        ? `${current.note}\nAnnulation: ${dto.reason}`
        : `Annulation: ${dto.reason}`
      : current.note;
    const record = await this.prisma.attendance.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        note,
      },
    });
    this.auditService.record({
      actorId: 'admin@madyproclean.com',
      action: 'CANCEL_ATTENDANCE',
      entityType: 'attendance',
      entityId: id,
      details: dto.reason,
    });
    return this.toView(this.toEntity(record));
  }

  async checkIn(dto: CheckInDto) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    if (!dto.interventionId) {
      throw new BadRequestException("L'intervention est requise pour démarrer.");
    }
    const intervention = await this.prisma.intervention.findFirst({
      where: { id: dto.interventionId, assignments: { some: { userId: dto.userId } } },
      include: { site: true },
    });
    if (!intervention) {
      throw new BadRequestException("Intervention introuvable ou non assignée.");
    }
    const site = (intervention as any)?.site ?? this.sitesService.findOne(dto.siteId);
    if (site.latitude == null || site.longitude == null) {
      throw new BadRequestException("Les coordonnées du site sont manquantes.");
    }
    const qrValid = await this.sitesService.validateQrCode(intervention.siteId, dto.qrCode);
    if (!qrValid) {
      const distance = this.computeDistance(
        { latitude: dto.latitude, longitude: dto.longitude },
        { ...site, latitude: site.latitude, longitude: site.longitude, supervisorIds: (site as any).supervisorIds ?? [] },
      );
      if (distance != null && distance > this.resolveMaxDistance(site as any)) {
        throw new BadRequestException("Vous êtes trop loin du site pour démarrer l'intervention.");
      }
    }
    // Anomalie horaire : check-in en dehors du créneau planifié (tolérance TIME_DRIFT_MS)
    const interventionDate = intervention.date.toISOString().slice(0, 10);
    const plannedStart = this.combine(interventionDate, intervention.startTime ?? '00:00');
    const plannedEnd = this.combine(interventionDate, intervention.endTime ?? '23:59');
    if (now.getTime() < plannedStart.getTime() - this.TIME_DRIFT_MS || now.getTime() > plannedEnd.getTime() + this.TIME_DRIFT_MS) {
      this.logger.warn(
        `[Anomalie horaire] Check-in hors plage (user=${dto.userId}, intervention=${intervention.id}, now=${now.toISOString()}, planned=${intervention.startTime}-${intervention.endTime})`,
      );
    }
    if (intervention) {
      await this.prisma.intervention.update({
        where: { id: intervention.id },
        data: { status: 'IN_PROGRESS' },
      });
    }
    let record: any = null;
    if (dto.attendanceId) {
      record = await this.prisma.attendance.findFirst({
        where: {
          id: dto.attendanceId,
          userId: dto.userId,
          interventionId: dto.interventionId,
        },
      });
    }
    if (!record) {
      record = await this.prisma.attendance.findFirst({
        where: {
          userId: dto.userId,
          interventionId: dto.interventionId,
          date: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (record) {
      record = await this.prisma.attendance.update({
        where: { id: record.id },
        data: {
          checkInTime: now,
          checkInLatitude: dto.latitude,
          checkInLongitude: dto.longitude,
          checkInPhoto: dto.photo,
          status: 'PENDING',
        },
      });
    } else {
      record = await this.prisma.attendance.create({
        data: {
          userId: dto.userId,
          date: startOfDay,
          checkInTime: now,
          checkInLatitude: dto.latitude,
          checkInLongitude: dto.longitude,
          checkInPhoto: dto.photo,
          interventionId: intervention?.id ?? dto.interventionId,
          status: 'PENDING',
          manual: false,
          createdBy: 'AGENT',
        } as any,
      });
    }
    this.auditService.record({
      actorId: dto.userId,
      action: 'UPDATE_ATTENDANCE',
      entityType: 'attendance',
      entityId: record.id,
      details: 'CHECK_IN',
    });
    const view = await this.toView(this.toEntity(record));
    this.realtime.broadcast('attendance.checkin', {
      attendanceId: view.id,
      userId: dto.userId,
      siteId: dto.siteId,
      status: view.status,
      checkInTime: view.checkInTime,
      date: view.date,
    });
    return view;
  }

  async checkOut(dto: CheckOutDto) {
    const now = new Date();
    if (!dto.interventionId) {
      throw new BadRequestException("L'intervention est requise pour terminer.");
    }
    let existing = null as any;
    if (dto.attendanceId) {
      existing = await this.prisma.attendance.findFirst({
        where: {
          id: dto.attendanceId,
          userId: dto.userId,
          status: { in: ['PENDING'] },
        },
      });
    }
    if (!existing) {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      existing = await this.prisma.attendance.findFirst({
        where: {
          userId: dto.userId,
          interventionId: dto.interventionId,
          date: { gte: todayStart, lte: todayEnd },
          status: { in: ['PENDING'] },
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (!existing) {
      throw new NotFoundException('Aucun check-in en cours');
    }
    const record = await this.prisma.attendance.update({
      where: { id: existing.id },
      data: {
        checkOutTime: new Date(),
        checkOutPhoto: dto.photo,
        status: 'COMPLETED',
      },
    });
    const interventionId = (existing as any).interventionId ?? undefined;
    await this.updateInterventionStatus(existing.userId, existing.date, 'COMPLETED', interventionId);
    const view = await this.toView(this.toEntity(record));
    this.realtime.broadcast('attendance.checkout', {
      attendanceId: view.id,
      userId: existing.userId,
      siteId: view.site.id,
      status: view.status,
      checkOutTime: view.checkOutTime,
      date: view.date,
    });
    this.auditService.record({
      actorId: dto.userId,
      action: 'UPDATE_ATTENDANCE',
      entityType: 'attendance',
      entityId: record.id,
      details: 'CHECK_OUT',
    });
    return view;
  }

  async markArrival(dto: MarkArrivalDto) {
    const now = new Date();
    if (!dto.interventionId) {
      throw new BadRequestException("L'intervention est requise pour enregistrer la présence.");
    }
    const intervention = await this.prisma.intervention.findFirst({
      where: { id: dto.interventionId, assignments: { some: { userId: dto.userId } } },
      include: { site: true },
    });
    if (!intervention) {
      throw new BadRequestException("Intervention introuvable ou non assignée.");
    }
    const rawSite = intervention.site ?? this.sitesService.findOne(dto.siteId);
    const site = { ...rawSite, supervisorIds: (rawSite as any).supervisorIds ?? [] };
    if (site.latitude == null || site.longitude == null) {
      throw new BadRequestException("Les coordonnées du site sont manquantes.");
    }
    // contrôle fenêtre horaire (30min avant le début, 1h après la fin)
    const dateStr =
      intervention.date instanceof Date
        ? intervention.date.toISOString().slice(0, 10)
        : new Date(intervention.date as any).toISOString().slice(0, 10);
    const plannedStart = this.combineFromParts(dateStr, intervention.startTime);
    const plannedEnd = this.combineFromParts(dateStr, intervention.endTime);
    const windowStart = new Date(plannedStart.getTime() - 30 * 60 * 1000);
    const windowEnd = new Date(plannedEnd.getTime() + 60 * 60 * 1000);
    if (now < windowStart) {
      throw new BadRequestException("Arrivée trop tôt : enregistrement possible 30 minutes avant le début.");
    }
    if (now > windowEnd) {
      throw new BadRequestException("Arrivée hors créneau : l'intervention est dépassée.");
    }
    const distance = this.computeDistance(
      { latitude: dto.latitude, longitude: dto.longitude },
      site as any,
    );
    if (distance != null && distance > this.resolveMaxDistance(site as any)) {
      throw new BadRequestException("Vous êtes trop loin du site pour enregistrer votre présence.");
    }

    const existing = await this.prisma.attendance.findFirst({
      where: {
        id: dto.attendanceId ?? undefined,
        userId: dto.userId,
        interventionId: dto.interventionId,
        date: {
          gte: this.toDateOnly(now.toISOString().slice(0, 10)),
          lte: this.endOfDay(now.toISOString().slice(0, 10)),
        },
      },
    } as any);

    const record = existing
      ? await this.prisma.attendance.update({
          where: { id: existing.id },
          data: {
            arrivalTime: now,
            arrivalLatitude: dto.latitude,
            arrivalLongitude: dto.longitude,
            interventionId: intervention?.id ?? dto.interventionId,
          } as any,
        })
      : await this.prisma.attendance.create({
        data: {
          userId: dto.userId,
          date: this.toDateOnly(now.toISOString().slice(0, 10)),
          arrivalTime: now,
          arrivalLatitude: dto.latitude,
          arrivalLongitude: dto.longitude,
          interventionId: intervention?.id ?? dto.interventionId,
          status: 'PENDING',
          manual: false,
          createdBy: 'AGENT',
        } as any,
      });

    if (intervention) {
      await this.prisma.intervention.update({
        where: { id: intervention.id },
        data: {
          observation: intervention.observation ?? 'Arrivée enregistrée',
        },
      });
    }

    const view = await this.toView(this.toEntity(record));
    this.realtime.broadcast('attendance.arrival', {
      attendanceId: view.id,
      userId: dto.userId,
      siteId: dto.siteId,
      arrivalTime: view.plannedStart ?? view.checkInTime ?? view.date,
      status: view.status,
    });
    this.auditService.record({
      actorId: dto.userId,
      action: 'UPDATE_ATTENDANCE',
      entityType: 'attendance',
      entityId: record.id,
      details: 'ARRIVAL',
    });
    return view;
  }

  async heartbeat(dto: HeartbeatDto) {
    const site = this.sitesService.findOne(dto.siteId);
    if (!site) {
      throw new BadRequestException('Site introuvable');
    }
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    let record: any = await this.prisma.attendance.findFirst({
      where: {
        userId: dto.userId,
        interventionId: dto.interventionId ?? undefined,
        date: { gte: startOfDay, lte: endOfDay },
        status: { in: ['PENDING'] },
      },
    });

    if (!record) {
      record = await this.prisma.attendance.create({
        data: {
          userId: dto.userId,
          interventionId: dto.interventionId ?? undefined,
          date: startOfDay,
          status: 'PENDING',
          manual: false,
          createdBy: 'AGENT',
          lastSeenAt: new Date(),
          lastSeenLatitude: dto.latitude,
          lastSeenLongitude: dto.longitude,
        } as any,
      });
    } else {
      const distance = this.computeDistance(
        { latitude: dto.latitude, longitude: dto.longitude },
        { ...site, latitude: site.latitude!, longitude: site.longitude! },
      );
      const outside = distance != null && distance > this.resolveMaxDistance(site as any);
      const outsideSince = outside ? record.outsideSince ?? new Date() : null;

      if (outside && !record.outsideSince) {
        this.notifications.send({
          audience: 'AGENT',
          targetId: dto.userId,
          title: 'Position hors site',
          message: "Vous n'êtes plus sur le site. L'intervention sera marquée terminée dans 5 minutes.",
        } as any);
      }

      record = (await this.prisma.attendance.update({
        where: { id: record.id },
        data: {
          lastSeenAt: new Date(),
          lastSeenLatitude: dto.latitude,
          lastSeenLongitude: dto.longitude,
          outsideSince,
        } as any,
      })) as any;
    }

    return this.toView(this.toEntity(record));
  }

  private async checkOutsideAgents() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - this.OUTSIDE_GRACE_MS);
    const drifted = (await this.prisma.attendance.findMany({
      where: {
        status: 'PENDING',
      },
    })) as any[];

    await Promise.all(
      drifted.map(async (att) => {
        if (!att.outsideSince || att.outsideSince > cutoff) {
          return;
        }
    await this.prisma.attendance.update({
      where: { id: att.id },
      data: {
        checkOutTime: now,
        status: 'COMPLETED',
        outsideSince: null,
      } as any,
    });
        await this.updateInterventionStatus(att.userId, att.date, 'COMPLETED', att.interventionId);
        this.notifications.send({
          audience: 'AGENT',
          targetId: att.userId,
          title: 'Intervention clôturée',
          message: "Vous avez quitté le site, l'intervention a été clôturée automatiquement.",
        } as any);
      }),
    );
  }

  private async updateInterventionStatus(
    userId: string,
    date: Date,
    status: AttendanceStatus,
    interventionId?: string | null,
  ) {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
    const intervention = interventionId
      ? await this.prisma.intervention.findFirst({
          where: {
            id: interventionId,
            status: { notIn: ['CANCELLED'] },
          },
          include: { assignments: true },
        })
      : await this.prisma.intervention.findFirst({
          where: {
            date: { gte: startOfDay, lte: endOfDay },
            assignments: { some: { userId } },
            status: { notIn: ['CANCELLED'] },
          },
          include: { assignments: true },
        });
    if (!intervention) return;

    if (status === 'COMPLETED') {
      // Le check-out d'un agent ne clôture jamais l'intervention tout seul : même quand c'est le
      // dernier agent assigné à terminer, elle passe en attente de validation par le superviseur
      // (jamais directement à COMPLETED — seul PATCH /interventions/:id le fait, réservé au superviseur).
      const assignedUserIds = intervention.assignments.map((a) => a.userId);
      const attForAgents = await this.prisma.attendance.findMany({
        where: {
          interventionId: intervention.id,
          userId: { in: assignedUserIds },
        },
      });
      const { complete } = checkAttendanceCompleteness(assignedUserIds, attForAgents as any);
      await this.prisma.intervention.update({
        where: { id: intervention.id },
        data: { status: complete ? 'NEEDS_REVIEW' : 'IN_PROGRESS' },
      });
      if (complete && intervention.status !== 'NEEDS_REVIEW') {
        const site = await this.prisma.site.findUnique({ where: { id: intervention.siteId }, select: { name: true } });
        const siteName = site?.name ?? 'Un site';
        await this.notifications.notifySiteSupervisors([intervention.siteId], {
          title: 'Intervention à valider',
          message: `${siteName} : tous les agents ont terminé, l'intervention attend votre validation.`,
          data: { interventionId: intervention.id },
        });
      }
      return;
    }

    await this.prisma.intervention.update({
      where: { id: intervention.id },
      data: { status: 'IN_PROGRESS' },
    });
  }

  private async ensureWithinInterventionWindow(
    userId: string,
    siteId: string,
    now: Date,
    options: { allowBeforeStart?: boolean } = {},
  ) {
    // Utilise l'heure locale (France) pour éviter les décalages UTC
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const interventions = await this.prisma.intervention.findMany({
      where: {
        siteId,
        date: { gte: startOfDay, lte: endOfDay },
        assignments: { some: { userId } },
        status: { notIn: ['CANCELLED'] },
      },
      orderBy: { startTime: 'asc' },
    });

    if (!interventions.length) {
      this.logger.warn(
        `ensureWithinInterventionWindow: aucune intervention (site=${siteId}, user=${userId}, date=${now.toISOString().slice(0,10)})`,
      );
    }

    if (!interventions.length) {
      throw new BadRequestException("Aucune intervention planifiée pour ce site aujourd'hui.");
    }

    // Cherche l'intervention dont le créneau (avec tolérance) encadre l'heure courante
    type WindowedIntervention = {
      intervention: (typeof interventions)[number];
      windowStart: Date;
      windowEnd: Date;
      plannedStart: Date;
      plannedEnd: Date;
    };

    const withWindows: WindowedIntervention[] = interventions.map((intervention) => {
      const dateStr =
        intervention.date instanceof Date
          ? intervention.date.toISOString().slice(0, 10)
          : new Date(intervention.date as any).toISOString().slice(0, 10);
      const plannedStart = this.combineFromParts(dateStr, intervention.startTime);
      const plannedEnd = this.combineFromParts(dateStr, intervention.endTime);
      const windowStart = new Date(
        plannedStart.getTime() - (options.allowBeforeStart ? 30 * 60 * 1000 : 0),
      );
      const windowEnd = new Date(plannedEnd.getTime() + 60 * 60 * 1000); // 1h de grâce après la fin
      return { intervention, windowStart, windowEnd, plannedStart, plannedEnd };
    });

    const candidates = withWindows
      .filter((item) => now >= item.windowStart && now <= item.windowEnd)
      .sort((a, b) => b.plannedStart.getTime() - a.plannedStart.getTime());
    const selected = candidates[0];

    if (selected) {
      return selected.intervention;
    }

    const earliest = withWindows[0];
    const latest = withWindows[withWindows.length - 1];

    if (now < earliest.windowStart) {
      throw new BadRequestException(
        "L'intervention n'a pas encore commencé (en dehors du créneau).",
      );
    }
    if (now > latest.windowEnd) {
      throw new BadRequestException("Le créneau de l'intervention est dépassé.");
    }

    throw new BadRequestException("Aucune intervention en cours pour ce créneau.");
  }

  /**
   * Convertit une date + heure "murale" en Europe/Paris (ex: "12:00") en le véritable instant UTC
   * correspondant, sans dépendre du fuseau horaire système du process (correct que le serveur
   * tourne en UTC — cas de prod habituel — ou en Europe/Paris — cas de cet environnement de dev —
   * et correct été comme hiver grâce à Intl plutôt qu'un décalage fixe).
   */
  private combineFromParts(dateStr: string, time: string) {
    const [hours, minutes] = time.split(':').map((v) => parseInt(v, 10) || 0);
    const [year, month, day] = dateStr.split('-').map((v) => parseInt(v, 10));
    const guessUtc = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
    const parisString = guessUtc.toLocaleString('en-US', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parisAsUtc = new Date(`${parisString.replace(',', '')} UTC`);
    const offsetMs = guessUtc.getTime() - parisAsUtc.getTime();
    return new Date(guessUtc.getTime() + offsetMs);
  }

  private combine(date: string, time: string) {
    return this.combineFromParts(date, time);
  }

  private formatDate(date?: Date) {
    if (!date) return '';
    return date.toISOString().slice(0, 10);
  }

  private formatTime(date?: Date) {
    if (!date) return undefined;
    // toISOString().slice(11, 16) renvoie l'heure UTC brute : décalée de l'heure de Paris (CET/CEST),
    // ce qui désynchronisait cet affichage web (basé sur cette API) de l'écran mobile (qui, lui,
    // reconvertit correctement une date ISO en heure locale via toLocaleTimeString côté device).
    return date.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  }

  private computeDistance(coords: { latitude: number; longitude: number }, site: ReturnType<SitesService['findOne']>) {
    if (!site.latitude || !site.longitude) return undefined;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(coords.latitude - site.latitude);
    const dLon = toRad(coords.longitude - site.longitude);
    const lat1 = toRad(site.latitude);
    const lat2 = toRad(coords.latitude);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  async getAnomalies(siteIds: string[] | null = null) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const attendances = await this.prisma.attendance.findMany({
      where: {
        date: { gte: since },
        checkInTime: { not: null },
        checkOutTime: { not: null },
        ...(siteIds ? { intervention: { siteId: { in: siteIds } } } : {}),
      },
      include: { user: { select: { firstName: true, lastName: true } }, intervention: { select: { siteId: true, site: { select: { name: true } } } } },
    });

    const durationsBySite = new Map<string, number[]>();
    attendances.forEach((a) => {
      const minutes = (a.checkOutTime!.getTime() - a.checkInTime!.getTime()) / 60000;
      const list = durationsBySite.get(a.intervention.siteId) ?? [];
      list.push(minutes);
      durationsBySite.set(a.intervention.siteId, list);
    });

    const anomalies: any[] = [];
    attendances.forEach((a) => {
      const minutes = (a.checkOutTime!.getTime() - a.checkInTime!.getTime()) / 60000;
      const siteDurations = durationsBySite.get(a.intervention.siteId) ?? [];
      if (siteDurations.length >= 5) {
        const avg = siteDurations.reduce((s, d) => s + d, 0) / siteDurations.length;
        if (minutes < avg * 0.3 || minutes > avg * 2) {
          anomalies.push({
            type: 'SUSPICIOUS_DURATION',
            attendanceId: a.id,
            userId: a.userId,
            agentName: `${a.user.firstName} ${a.user.lastName}`.trim(),
            siteName: a.intervention.site.name,
            date: a.date,
            durationMinutes: Math.round(minutes),
            siteAverageMinutes: Math.round(avg),
          });
        }
      }
    });

    const outsideCounts = await this.prisma.attendance.groupBy({
      by: ['userId'],
      where: { date: { gte: since }, outsideSince: { not: null } },
      _count: { userId: true },
    });
    for (const entry of outsideCounts) {
      if (entry._count.userId < 3) continue;
      const user = this.usersService.findOne(entry.userId);
      anomalies.push({
        type: 'REPEATED_OUTSIDE_ZONE',
        userId: entry.userId,
        agentName: user?.name ?? 'Agent inconnu',
        occurrences: entry._count.userId,
      });
    }

    return anomalies;
  }

  async getLiveMap(siteIds: string[] | null = null) {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const records = await this.prisma.attendance.findMany({
      where: {
        ...(siteIds ? { intervention: { siteId: { in: siteIds } } } : {}),
        status: 'PENDING',
        checkInTime: { not: null },
        checkOutTime: null,
        lastSeenAt: { gte: cutoff },
        lastSeenLatitude: { not: null },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        intervention: { select: { id: true, siteId: true, site: { select: { name: true } } } },
      },
      orderBy: { lastSeenAt: 'desc' },
    });
    return records.map((r) => ({
      userId: r.userId,
      agentName: `${r.user.firstName} ${r.user.lastName}`.trim(),
      interventionId: r.interventionId,
      siteId: r.intervention.siteId,
      siteName: r.intervention.site.name,
      latitude: r.lastSeenLatitude,
      longitude: r.lastSeenLongitude,
      lastSeenAt: r.lastSeenAt,
    }));
  }
}
