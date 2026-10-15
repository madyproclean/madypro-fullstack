import { ForbiddenException, Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AbsenceEntity, AbsenceStatus, AbsenceType } from './entities/absence.entity';
import { UsersService } from '../users/users.service';
import { SitesService } from '../sites/sites.service';
import { CreateAbsenceRequestDto } from './dto/create-absence-request.dto';
import { CreateManualAbsenceDto } from './dto/create-manual-absence.dto';
import { UpdateAbsenceStatusDto } from './dto/update-absence-status.dto';
import { AuditService } from '../audit/audit.service';
import { InterventionsService } from '../interventions/interventions.service';
import { PrismaService } from '../database/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { SupervisorScopeService } from '../common/supervisor-scope/supervisor-scope.service';
import { NotificationsService } from '../notifications/notifications.service';

type AbsenceFilters = {
  status?: AbsenceStatus | 'all';
  type?: AbsenceType | 'all';
  userId?: string;
  siteId?: string;
  startDate?: string;
  endDate?: string;
  manual?: boolean;
  page?: number;
  pageSize?: number;
};

type AbsenceView = {
  id: string;
  agent: { id: string; name: string };
  type: AbsenceType;
  status: AbsenceStatus;
  from: string;
  to: string;
  reason: string;
  note?: string;
  attachment?: string;
  manual: boolean;
  createdBy: string;
  validatedBy?: string;
  validationComment?: string;
  site?: { id: string; name: string };
  requiresSecondApproval: boolean;
  level1ApprovedBy?: string;
  level1ApprovedAt?: Date;
};

type AbsenceRecord = Prisma.AbsenceGetPayload<{
  include: { site: false };
}>;

@Injectable()
export class AbsencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly sitesService: SitesService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
    private readonly scope: SupervisorScopeService,
    @Optional() private readonly interventions?: InterventionsService,
  ) {}

  private toDateOnly(value: string) {
    const normalized = (value ?? '').trim();
    const d = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Date invalide');
    }
    return d;
  }

  private toEntity(record: AbsenceRecord): AbsenceEntity {
    return {
      id: record.id,
      userId: record.userId,
      siteId: record.siteId ?? undefined,
      type: record.type,
      status: record.status,
      from: record.from.toISOString().slice(0, 10),
      to: record.to.toISOString().slice(0, 10),
      reason: record.reason,
      note: record.note ?? undefined,
      attachment: record.attachment ?? undefined,
      manual: record.manual,
      createdBy: record.createdBy as 'USER' | 'ADMIN',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      validatedBy: record.validatedBy ?? undefined,
      validationComment: record.validationComment ?? undefined,
      requiresSecondApproval: record.requiresSecondApproval,
      level1ApprovedBy: record.level1ApprovedBy ?? undefined,
      level1ApprovedAt: record.level1ApprovedAt ?? undefined,
    };
  }

  private toView(absence: AbsenceEntity): AbsenceView {
    const user = this.usersService.findOne(absence.userId);
    const site = absence.siteId ? this.sitesService.findOne(absence.siteId) : null;
    return {
      id: absence.id,
      agent: { id: user?.id ?? absence.userId, name: user?.name ?? 'Agent inconnu' },
      type: absence.type,
      status: absence.status,
      from: absence.from,
      to: absence.to,
      reason: absence.reason,
      note: absence.note,
      attachment: absence.attachment,
      manual: absence.manual,
      createdBy: absence.createdBy,
      validatedBy: absence.validatedBy,
      validationComment: absence.validationComment,
      site: site ? { id: site.id, name: site.name } : undefined,
      requiresSecondApproval: absence.requiresSecondApproval,
      level1ApprovedBy: absence.level1ApprovedBy,
      level1ApprovedAt: absence.level1ApprovedAt,
    };
  }

  async assertAgentInScope(agentUserId: string, viewer?: { id?: string; role?: string }) {
    const scoped = await this.scope.agentIds(viewer);
    if (scoped && !scoped.has(agentUserId)) {
      throw new ForbiddenException("Cet agent n'est pas dans votre périmètre de supervision");
    }
  }

  async list(filters: AbsenceFilters = {}, viewer?: { id?: string; role?: string }) {
    const where: Prisma.AbsenceWhereInput = {};
    if (filters.status && filters.status !== 'all') where.status = filters.status;
    if (filters.type && filters.type !== 'all') where.type = filters.type;
    if (filters.manual) where.manual = true;
    if (filters.siteId) where.siteId = filters.siteId;
    const role = viewer?.role?.toString().trim().toUpperCase();
    if (role === 'AGENT') {
      if (!viewer?.id) {
        throw new UnauthorizedException('Utilisateur requis');
      }
      where.userId = viewer.id;
    } else if (filters.userId) {
      where.userId = filters.userId;
    }
    const scopedAgentIds = await this.scope.agentIds(viewer);
    if (scopedAgentIds) {
      if (filters.userId && !scopedAgentIds.has(filters.userId)) {
        // Agent demandé hors périmètre : ne rien renvoyer plutôt que de laisser passer le filtre tel quel.
        where.userId = '__none__';
      } else if (!filters.userId) {
        where.userId = { in: Array.from(scopedAgentIds) };
      }
    }
    if (filters.startDate) {
      where.to = { gte: this.toDateOnly(filters.startDate) };
    }
    if (filters.endDate) {
      where.from = { lte: this.toDateOnly(filters.endDate) };
    }

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const [records, total] = await Promise.all([
      this.prisma.absence.findMany({
        where,
        orderBy: [{ from: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.absence.count({ where }),
    ]);
    // filet de sécurité : si AGENT, on ne retourne que ses propres demandes même si un filtre incorrect est passé
    const filteredRecords =
      role === 'AGENT' && viewer?.id ? records.filter((r) => r.userId === viewer.id) : records;
    return {
      items: filteredRecords.map((record) => this.toView(this.toEntity(record))),
      total: role === 'AGENT' ? filteredRecords.length : total,
      page,
      pageSize,
    };
  }

  async detail(id: string, viewer?: { id?: string; role?: string }) {
    const record = await this.prisma.absence.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException('Absence introuvable');
    }
    await this.assertAgentInScope(record.userId, viewer);
    return this.toView(this.toEntity(record));
  }

  private durationInDays(from: Date, to: Date) {
    return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  }

  async getLeaveBalance(userId: string, year: number) {
    const [allocation, approved] = await Promise.all([
      this.prisma.leaveAllocation.findUnique({ where: { userId_year: { userId, year } } }),
      this.prisma.absence.findMany({
        where: {
          userId,
          type: 'PAID_LEAVE',
          status: 'APPROVED',
          from: { gte: new Date(`${year}-01-01T00:00:00.000Z`) },
          to: { lte: new Date(`${year}-12-31T23:59:59.999Z`) },
        },
      }),
    ]);
    const allocatedDays = allocation?.allocatedDays ?? 25;
    const usedDays = approved.reduce((sum, a) => sum + this.durationInDays(a.from, a.to), 0);
    return { userId, year, allocatedDays, usedDays, remaining: allocatedDays - usedDays };
  }

  setLeaveAllocation(userId: string, year: number, allocatedDays: number) {
    return this.prisma.leaveAllocation.upsert({
      where: { userId_year: { userId, year } },
      update: { allocatedDays },
      create: { userId, year, allocatedDays },
    });
  }

  private async checkOverlap(userId: string, fromDate: Date, toDate: Date, excludeId?: string) {
    const overlapping = await this.prisma.absence.findFirst({
      where: {
        userId,
        status: { not: 'REJECTED' },
        from: { lte: toDate },
        to: { gte: fromDate },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (overlapping) {
      throw new BadRequestException(
        `Une absence existe déjà pour cet agent du ${overlapping.from.toISOString().slice(0, 10)} au ${overlapping.to.toISOString().slice(0, 10)}`,
      );
    }
  }

  private async checkBlockedPeriod(fromDate: Date, toDate: Date) {
    const blocked = await this.prisma.blockedPeriod.findFirst({
      where: { from: { lte: toDate }, to: { gte: fromDate } },
    });
    if (blocked) {
      throw new BadRequestException(`Période bloquée du ${blocked.from.toISOString().slice(0, 10)} au ${blocked.to.toISOString().slice(0, 10)} : ${blocked.reason}`);
    }
  }

  listBlockedPeriods() {
    return this.prisma.blockedPeriod.findMany({ orderBy: { from: 'asc' } });
  }

  createBlockedPeriod(from: string, to: string, reason: string) {
    const fromDate = this.toDateOnly(from);
    const toDate = this.toDateOnly(to);
    if (fromDate > toDate) {
      throw new BadRequestException('La date de début doit être avant la date de fin');
    }
    return this.prisma.blockedPeriod.create({ data: { from: fromDate, to: toDate, reason } });
  }

  async removeBlockedPeriod(id: string) {
    const existing = await this.prisma.blockedPeriod.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Période introuvable');
    }
    await this.prisma.blockedPeriod.delete({ where: { id } });
    return { deleted: true };
  }

  async request(data: CreateAbsenceRequestDto) {
    if (!data.userId) {
      throw new BadRequestException('userId requis');
    }
    if (!this.usersService.findOne(data.userId)) {
      throw new NotFoundException('Agent introuvable');
    }
    const fromDate = this.toDateOnly(data.from);
    const toDate = this.toDateOnly(data.to);
    if (fromDate > toDate) {
      throw new BadRequestException('La date de début doit être avant la date de fin');
    }
    await this.checkBlockedPeriod(fromDate, toDate);
    await this.checkOverlap(data.userId, fromDate, toDate);

    const duration = this.durationInDays(fromDate, toDate);
    const requiresSecondApproval = duration > 5;

    let autoApproved = false;
    if (duration <= 2 && !requiresSecondApproval) {
      if (data.type !== 'PAID_LEAVE') {
        autoApproved = true;
      } else {
        const balance = await this.getLeaveBalance(data.userId, fromDate.getUTCFullYear());
        autoApproved = balance.remaining >= duration;
      }
    }

    const record = await this.prisma.absence.create({
      data: {
        userId: data.userId,
        siteId: data.siteId,
        type: data.type,
        status: autoApproved ? 'APPROVED' : 'PENDING',
        from: fromDate,
        to: toDate,
        reason: data.reason,
        note: data.note,
        attachment: data.attachment,
        manual: false,
        createdBy: 'USER',
        requiresSecondApproval,
        validatedBy: autoApproved ? 'AUTO' : undefined,
      },
    });
    this.auditService.record({
      actorId: data.userId,
      action: 'CREATE_ABSENCE',
      entityType: 'absence',
      entityId: record.id,
      details: autoApproved ? `Demande ${data.type} (auto-approuvée)` : `Demande ${data.type}`,
    });
    if (!autoApproved) {
      const agentName = this.usersService.findOne(data.userId)?.name ?? 'Un agent';
      await this.notifications.notifyAgentSupervisors(data.userId, {
        title: 'Absence à valider',
        message: `${agentName} demande une absence du ${data.from} au ${data.to}.`,
        category: 'absence',
        data: { absenceId: record.id },
      });
    }
    return this.toView(this.toEntity(record));
  }

  async approveLevel1(id: string, approverId: string, viewer?: { id?: string; role?: string }) {
    const absence = await this.prisma.absence.findUnique({ where: { id } });
    if (!absence) {
      throw new NotFoundException('Absence introuvable');
    }
    await this.assertAgentInScope(absence.userId, viewer);
    if (!absence.requiresSecondApproval) {
      throw new BadRequestException("Cette absence ne nécessite pas de validation à deux niveaux");
    }
    if (absence.status !== 'PENDING') {
      throw new BadRequestException('Cette absence a déjà été traitée');
    }
    if (absence.level1ApprovedBy) {
      throw new BadRequestException('Cette absence a déjà reçu une première validation');
    }
    const record = await this.prisma.absence.update({
      where: { id },
      data: { level1ApprovedBy: approverId, level1ApprovedAt: new Date() },
    });
    return this.toView(this.toEntity(record));
  }

  async createManual(data: CreateManualAbsenceDto, actor?: { id?: string; role?: string }) {
    if (!this.usersService.findOne(data.userId)) {
      throw new NotFoundException('Agent introuvable');
    }
    await this.assertAgentInScope(data.userId, actor);
    const fromDate = this.toDateOnly(data.from);
    const toDate = this.toDateOnly(data.to);
    if (fromDate > toDate) {
      throw new BadRequestException('La date de début doit être avant la date de fin');
    }
    await this.checkBlockedPeriod(fromDate, toDate);
    await this.checkOverlap(data.userId, fromDate, toDate);
    const actorLabel = actor?.role ?? 'ADMIN';
    const record = await this.prisma.absence.create({
      data: {
        userId: data.userId,
        siteId: data.siteId,
        type: data.type,
        status: 'APPROVED',
        from: fromDate,
        to: toDate,
        reason: data.reason,
        note: data.note,
        attachment: data.attachment,
        manual: true,
        createdBy: actorLabel,
        validatedBy: actorLabel,
      },
    });
    this.auditService.record({
      actorId: actor?.id ?? 'admin@madyproclean.com',
      action: 'CREATE_ABSENCE',
      entityType: 'absence',
      entityId: record.id,
      details: `Manuel ${data.type}`,
    });
    return this.toView(this.toEntity(record));
  }

  async updateStatus(id: string, dto: UpdateAbsenceStatusDto, viewer?: { id?: string; role?: string }) {
    const existing = await this.prisma.absence.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Absence introuvable');
    }
    await this.assertAgentInScope(existing.userId, viewer);
    if (existing.status !== 'PENDING') {
      throw new BadRequestException(`Cette absence a déjà été traitée (statut actuel : ${existing.status})`);
    }
    if (dto.status === 'APPROVED') {
      if (existing.requiresSecondApproval && !existing.level1ApprovedBy) {
        throw new BadRequestException(
          "Cette absence nécessite une première validation (superviseur) avant l'approbation finale",
        );
      }
      // Double contrôle : le superviseur donne la première validation, l'accord final revient à l'administrateur.
      if (existing.requiresSecondApproval && viewer?.role === 'SUPERVISOR') {
        throw new ForbiddenException("L'accord final de cette absence longue revient à l'administrateur");
      }
    }
    const record = await this.prisma.absence.update({
      where: { id },
      data: {
        status: dto.status,
        validatedBy: dto.validatedBy,
        validationComment: dto.comment,
      },
    });
    this.auditService.record({
      actorId: viewer?.id ?? dto.validatedBy ?? 'unknown',
      action: 'UPDATE_ABSENCE_STATUS',
      entityType: 'absence',
      entityId: id,
      details: dto.status,
    });
    if (dto.status === 'APPROVED' || dto.status === 'REJECTED') {
      await this.notifications.send({
        title: dto.status === 'APPROVED' ? 'Absence approuvée' : 'Absence refusée',
        message:
          dto.status === 'APPROVED'
            ? `Votre demande d'absence du ${record.from.toLocaleDateString('fr-FR')} au ${record.to.toLocaleDateString('fr-FR')} a été approuvée.`
            : `Votre demande d'absence du ${record.from.toLocaleDateString('fr-FR')} au ${record.to.toLocaleDateString('fr-FR')} a été refusée.${dto.comment ? ` Motif : ${dto.comment}` : ''}`,
        audience: 'AGENT',
        targetId: record.userId,
        data: { path: 'AgentRequests' },
      });
    }
    return this.toView(this.toEntity(record));
  }

  /**
   * Pour une absence validée, propose pour chaque intervention impactée
   * des agents disponibles (ni déjà affectés, ni en conflit d'horaire,
   * ni eux-mêmes absents) pour remplacer l'agent absent.
   */
  async getReplacementSuggestions(id: string, viewer?: { id?: string; role?: string }) {
    const absence = await this.prisma.absence.findUnique({ where: { id } });
    if (!absence) {
      throw new NotFoundException('Absence introuvable');
    }
    await this.assertAgentInScope(absence.userId, viewer);
    if (absence.status !== 'APPROVED') {
      return { absenceId: id, interventions: [] };
    }

    // Planning de la période (gabarits + changements d'un jour), missions déjà créées comprises :
    // les missions futures ne sont créées que peu avant leur début.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
    const from = absence.from.toISOString().slice(0, 10);
    const startDate = from > today ? from : today;
    const endDate = absence.to.toISOString().slice(0, 10);
    if (startDate > endDate || !this.interventions) {
      return { absenceId: id, interventions: [] };
    }
    const planning = await this.interventions.getPlanning({ startDate, endDate });
    const affected = planning.filter(
      (o) =>
        o.agentIds.includes(absence.userId) &&
        (o.source === 'projected' || o.status === 'PLANNED' || o.status === 'IN_PROGRESS'),
    );
    if (!affected.length) {
      return { absenceId: id, interventions: [] };
    }

    const agents = await this.prisma.user.findMany({
      where: { role: 'AGENT', active: true, id: { not: absence.userId } },
    });
    const otherAbsences = await this.prisma.absence.findMany({
      where: {
        status: 'APPROVED',
        userId: { in: agents.map((a) => a.id) },
        from: { lte: new Date(`${endDate}T23:59:59.999Z`) },
        to: { gte: new Date(`${startDate}T00:00:00.000Z`) },
      },
    });

    const results = affected.map((occ) => {
      const busyIds = new Set<string>();
      otherAbsences
        .filter((a) => a.from.toISOString().slice(0, 10) <= occ.date && a.to.toISOString().slice(0, 10) >= occ.date)
        .forEach((a) => busyIds.add(a.userId));
      planning
        .filter((o) => o.date === occ.date && o.stopId !== occ.stopId && o.startTime < occ.endTime && occ.startTime < o.endTime)
        .forEach((o) => o.agentIds.forEach((agentId) => busyIds.add(agentId)));
      const candidates = agents.filter((agent) => !occ.agentIds.includes(agent.id) && !busyIds.has(agent.id));
      return {
        interventionId: occ.interventionId ?? null,
        templateId: occ.templateId,
        stopId: occ.stopId,
        siteId: occ.siteId,
        siteName: occ.siteName,
        date: occ.date,
        startTime: occ.startTime,
        endTime: occ.endTime,
        agentIds: occ.agentIds,
        candidates: candidates.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim() })),
      };
    });

    return { absenceId: id, interventions: results };
  }
}
