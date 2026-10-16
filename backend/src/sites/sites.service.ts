import { BadRequestException, Injectable, NotFoundException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { Site } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as QRCode from 'qrcode';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SiteEntity } from './entities/site.entity';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';
import { CreateSiteCategoryDto } from './dto/create-site-category.dto';
import { UpdateSiteCategoryDto } from './dto/update-site-category.dto';
import { MailerService } from '../notifications/mailer.service';
import { buildIcs } from '../common/utils/ics';

type SiteView = SiteEntity & {
  supervisors: { id: string; name: string }[];
};

type SiteFilters = {
  active?: boolean;
  /** Restreint aux sites donnés (périmètre superviseur). */
  siteIds?: string[] | null;
  page?: number;
  pageSize?: number;
};

@Injectable()
export class SitesService implements OnModuleInit {
  private sites: SiteEntity[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
    private readonly mailerService: MailerService,
  ) {}

  async onModuleInit() {
    await this.syncFromDatabase();
  }

  private async syncFromDatabase() {
    const records = await this.prisma.site.findMany({
      include: { supervisors: true },
      orderBy: { name: 'asc' },
    });
    this.sites = records.map((record) => this.mapRecord(record));
  }

  private mapRecord(record: Site & { supervisors: { userId: string }[] }): SiteEntity {
    return {
      id: record.id,
      name: record.name,
      address: record.address,
      latitude: record.latitude ?? undefined,
      longitude: record.longitude ?? undefined,
      timeWindow: record.timeWindow ?? undefined,
      active: record.active,
      supervisorIds: record.supervisors.map((item) => item.userId),
      accessInstructions: (record as any).accessInstructions ?? undefined,
      accessCode: (record as any).accessCode ?? undefined,
      contactName: (record as any).contactName ?? undefined,
      contactPhone: (record as any).contactPhone ?? undefined,
      contactEmail: (record as any).contactEmail ?? undefined,
      photos: (record as any).photos ?? [],
      gpsDistanceMeters: (record as any).gpsDistanceMeters ?? undefined,
      toleranceMinutes: (record as any).toleranceMinutes ?? undefined,
      minimumDurationMinutes: (record as any).minimumDurationMinutes ?? undefined,
    };
  }

  /**
   * Un agent ne consulte que les sites où il travaille : une mission sur les 60 derniers jours ou à
   * venir, ou un créneau du gabarit du site (le code d'accès figure sur la fiche).
   */
  async assertAgentWorksOnSite(siteId: string, userId: string) {
    const since = new Date(Date.now() - 60 * 86_400_000);
    const [assignment, stop] = await Promise.all([
      this.prisma.interventionAssignment.findFirst({
        where: { userId, intervention: { siteId, date: { gte: since } } },
        select: { userId: true },
      }),
      this.prisma.templateStop.findFirst({ where: { agentIds: { has: userId }, template: { siteId } }, select: { id: true } }),
    ]);
    if (!assignment && !stop) {
      throw new ForbiddenException("Ce site ne fait pas partie de vos missions");
    }
  }

  private ensureExists(id: string) {
    const site = this.sites.find((item) => item.id === id);
    if (!site) {
      throw new NotFoundException('Site introuvable');
    }
    return site;
  }

  private present(site: SiteEntity): SiteView {
    const supervisors = site.supervisorIds
      .map((identifier) => this.usersService.findOne(identifier))
      .filter((user): user is NonNullable<ReturnType<UsersService['findOne']>> => Boolean(user))
      .map((user) => ({ id: user.id, name: user.name }));
    return {
      ...site,
      supervisors,
    };
  }

  /**
   * Contrairement aux autres méthodes de lecture de ce service (findOne, ensureExists),
   * la liste paginée interroge Prisma directement à chaque appel plutôt que le tableau
   * `this.sites` en mémoire. Ce tableau n'est tenu à jour que par les mutations qui
   * passent par ce service (create/update/remove) ; toute écriture faite en dehors
   * (script de migration, accès direct à la base) le laisse périmé jusqu'au prochain
   * redémarrage. `findAll` est le seul appelant externe (aucun autre service ne le
   * consomme de façon synchrone), donc le rendre asynchrone ici est sans risque.
   */
  async findAll(filters: SiteFilters = { page: 1, pageSize: 20 }) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const where: Prisma.SiteWhereInput = filters.active === undefined ? {} : { active: filters.active };
    if (filters.siteIds) where.id = { in: filters.siteIds };
    const [records, total] = await Promise.all([
      this.prisma.site.findMany({
        where,
        include: { supervisors: true },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.site.count({ where }),
    ]);
    const items = records.map((record) => this.present(this.mapRecord(record)));
    return { items, total, page, pageSize };
  }

  findOne(id: string): SiteView {
    const site = this.ensureExists(id);
    return this.present(site);
  }

  async create(dto: CreateSiteDto, actorId = 'system'): Promise<SiteView> {
    const record = await this.prisma.site.create({
      data: {
        name: dto.name,
        address: dto.address,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        timeWindow: dto.timeWindow ?? null,
        active: dto.active ?? true,
        accessInstructions: dto.accessInstructions ?? null,
        accessCode: dto.accessCode ?? null,
        contactName: dto.contactName ?? null,
        contactPhone: dto.contactPhone ?? null,
        contactEmail: dto.contactEmail ?? null,
        photos: dto.photos ?? [],
        gpsDistanceMeters: dto.gpsDistanceMeters ?? null,
        toleranceMinutes: dto.toleranceMinutes ?? null,
        minimumDurationMinutes: dto.minimumDurationMinutes ?? null,
        supervisors: dto.supervisorIds?.length
          ? {
              create: dto.supervisorIds.map((userId) => ({ userId })),
            }
          : undefined,
      },
      include: { supervisors: true },
    });
    const site = this.mapRecord(record);
    this.sites.push(site);
    this.auditService.record({
      actorId,
      action: 'CREATE_SITE',
      entityType: 'site',
      entityId: site.id,
      details: site.name,
    });
    return this.present(site);
  }

  async update(id: string, dto: UpdateSiteDto, actorId = 'system'): Promise<SiteView> {
    const existing = this.ensureExists(id);
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
    if (dto.timeWindow !== undefined) data.timeWindow = dto.timeWindow;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.accessInstructions !== undefined) data.accessInstructions = dto.accessInstructions;
    if (dto.accessCode !== undefined) data.accessCode = dto.accessCode;
    if (dto.contactName !== undefined) data.contactName = dto.contactName;
    if (dto.contactPhone !== undefined) data.contactPhone = dto.contactPhone;
    if (dto.contactEmail !== undefined) data.contactEmail = dto.contactEmail;
    if (dto.photos !== undefined) data.photos = dto.photos;
    if (dto.gpsDistanceMeters !== undefined) data.gpsDistanceMeters = dto.gpsDistanceMeters;
    if (dto.toleranceMinutes !== undefined) data.toleranceMinutes = dto.toleranceMinutes;
    if (dto.minimumDurationMinutes !== undefined) data.minimumDurationMinutes = dto.minimumDurationMinutes;
    if (dto.supervisorIds !== undefined) {
      data.supervisors = {
        deleteMany: {},
        create: dto.supervisorIds.map((userId) => ({ userId })),
      };
    }

    const changedFields = Object.keys(data).filter((k) => k !== 'supervisors');
    const before: Record<string, unknown> = {};
    changedFields.forEach((field) => {
      before[field] = (existing as any)[field];
    });

    const record = await this.prisma.site.update({
      where: { id },
      data,
      include: { supervisors: true },
    });
    const site = this.mapRecord(record);
    const index = this.sites.findIndex((item) => item.id === id);
    this.sites[index] = site;
    const after: Record<string, unknown> = {};
    changedFields.forEach((field) => {
      after[field] = (site as any)[field];
    });
    this.auditService.record({
      actorId,
      action: 'UPDATE_SITE',
      entityType: 'site',
      entityId: site.id,
      details: Object.keys(data).join(', ') || undefined,
      before: changedFields.length ? before : undefined,
      after: changedFields.length ? after : undefined,
    });
    return this.present(site);
  }

  async remove(id: string, actorId = 'system'): Promise<SiteView> {
    this.ensureExists(id);
    const record = await this.prisma.site.update({
      where: { id },
      data: { active: false },
      include: { supervisors: true },
    });
    const site = this.mapRecord(record);
    const index = this.sites.findIndex((item) => item.id === id);
    this.sites[index] = site;
    this.auditService.record({
      actorId,
      action: 'DELETE_SITE',
      entityType: 'site',
      entityId: site.id,
      details: site.name,
    });
    return this.present(site);
  }

  async listSiteCategories(siteId: string) {
    this.ensureExists(siteId);
    return this.prisma.siteCategory.findMany({
      where: { siteId },
      include: { category: true, checklist: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addSiteCategory(siteId: string, dto: CreateSiteCategoryDto, actorId = 'system') {
    this.ensureExists(siteId);
    const existing = await this.prisma.siteCategory.findUnique({
      where: { siteId_categoryId: { siteId, categoryId: dto.categoryId } },
    });
    if (existing) {
      throw new BadRequestException('Cette catégorie est déjà associée à ce site.');
    }
    const siteCategory = await this.prisma.siteCategory.create({
      data: {
        siteId,
        categoryId: dto.categoryId,
        startTime: dto.startTime,
        endTime: dto.endTime,
        active: dto.active ?? true,
        unitPriceHT: dto.unitPriceHT ?? null,
      },
      include: { category: true, checklist: true },
    });
    this.auditService.record({
      actorId,
      action: 'UPDATE_SITE',
      entityType: 'site',
      entityId: siteId,
      details: `Catégorie ajoutée : ${siteCategory.category.label}`,
    });
    return siteCategory;
  }

  private async ensureSiteCategoryExists(siteId: string, siteCategoryId: string) {
    const siteCategory = await this.prisma.siteCategory.findFirst({ where: { id: siteCategoryId, siteId } });
    if (!siteCategory) {
      throw new NotFoundException('Catégorie de site introuvable');
    }
    return siteCategory;
  }

  async updateSiteCategory(siteId: string, siteCategoryId: string, dto: UpdateSiteCategoryDto, actorId = 'system') {
    this.ensureExists(siteId);
    await this.ensureSiteCategoryExists(siteId, siteCategoryId);
    const siteCategory = await this.prisma.siteCategory.update({
      where: { id: siteCategoryId },
      data: {
        ...(dto.startTime !== undefined ? { startTime: dto.startTime } : {}),
        ...(dto.endTime !== undefined ? { endTime: dto.endTime } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.unitPriceHT !== undefined ? { unitPriceHT: dto.unitPriceHT } : {}),
      },
      include: { category: true, checklist: true },
    });
    this.auditService.record({
      actorId,
      action: 'UPDATE_SITE',
      entityType: 'site',
      entityId: siteId,
      details: `Catégorie modifiée : ${siteCategory.category.label}`,
    });
    return siteCategory;
  }

  async removeSiteCategory(siteId: string, siteCategoryId: string, actorId = 'system') {
    this.ensureExists(siteId);
    const siteCategory = await this.ensureSiteCategoryExists(siteId, siteCategoryId);
    await this.prisma.siteCategory.delete({ where: { id: siteCategoryId } });
    this.auditService.record({
      actorId,
      action: 'UPDATE_SITE',
      entityType: 'site',
      entityId: siteId,
      details: `Catégorie retirée`,
    });
    return { success: true };
  }

  async createSiteCategoryChecklistItem(
    siteId: string,
    siteCategoryId: string,
    dto: CreateChecklistItemDto,
    actorId = 'system',
  ) {
    this.ensureExists(siteId);
    await this.ensureSiteCategoryExists(siteId, siteCategoryId);
    const item = await this.prisma.siteCategoryChecklistItem.create({
      data: { siteCategoryId, label: dto.label, order: dto.order ?? 0 },
    });
    this.auditService.record({
      actorId,
      action: 'UPDATE_SITE',
      entityType: 'site',
      entityId: siteId,
      details: `Checklist +${dto.label}`,
    });
    return item;
  }

  async updateSiteCategoryChecklistItem(
    siteId: string,
    siteCategoryId: string,
    itemId: string,
    dto: UpdateChecklistItemDto,
    actorId = 'system',
  ) {
    this.ensureExists(siteId);
    await this.ensureSiteCategoryExists(siteId, siteCategoryId);
    const existing = await this.prisma.siteCategoryChecklistItem.findFirst({ where: { id: itemId, siteCategoryId } });
    if (!existing) {
      throw new NotFoundException('Élément de checklist introuvable');
    }
    const item = await this.prisma.siteCategoryChecklistItem.update({
      where: { id: itemId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
    this.auditService.record({
      actorId,
      action: 'UPDATE_SITE',
      entityType: 'site',
      entityId: siteId,
      details: `Checklist modifiée: ${item.label}`,
    });
    return item;
  }

  async removeSiteCategoryChecklistItem(siteId: string, siteCategoryId: string, itemId: string, actorId = 'system') {
    this.ensureExists(siteId);
    await this.ensureSiteCategoryExists(siteId, siteCategoryId);
    const existing = await this.prisma.siteCategoryChecklistItem.findFirst({ where: { id: itemId, siteCategoryId } });
    if (!existing) {
      throw new NotFoundException('Élément de checklist introuvable');
    }
    await this.prisma.siteCategoryChecklistItem.delete({ where: { id: itemId } });
    this.auditService.record({
      actorId,
      action: 'UPDATE_SITE',
      entityType: 'site',
      entityId: siteId,
      details: `Checklist -${existing.label}`,
    });
    return { success: true };
  }

  listContracts(siteId: string) {
    this.ensureExists(siteId);
    return this.prisma.siteContract.findMany({ where: { siteId }, orderBy: { endDate: 'asc' } });
  }

  findExpiringContracts(days = 30, siteIds: string[] | null = null) {
    const now = new Date();
    const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.prisma.siteContract.findMany({
      where: { endDate: { gte: now, lte: horizon }, ...(siteIds ? { siteId: { in: siteIds } } : {}) },
      orderBy: { endDate: 'asc' },
      include: { site: { select: { id: true, name: true } } },
    });
  }

  createContract(
    siteId: string,
    dto: { label: string; startDate: string; endDate: string; slaDetails?: string; documentUrl?: string },
  ) {
    this.ensureExists(siteId);
    return this.prisma.siteContract.create({
      data: {
        siteId,
        label: dto.label,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        slaDetails: dto.slaDetails,
        documentUrl: dto.documentUrl,
      },
    });
  }

  async removeContract(siteId: string, contractId: string) {
    this.ensureExists(siteId);
    const existing = await this.prisma.siteContract.findFirst({ where: { id: contractId, siteId } });
    if (!existing) {
      throw new NotFoundException('Contrat introuvable');
    }
    await this.prisma.siteContract.delete({ where: { id: contractId } });
    return { deleted: true };
  }

  listZones(siteId: string) {
    this.ensureExists(siteId);
    return this.prisma.siteZone.findMany({ where: { siteId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  }

  createZone(siteId: string, dto: { label: string; floor?: string; order?: number }) {
    this.ensureExists(siteId);
    return this.prisma.siteZone.create({
      data: { siteId, label: dto.label, floor: dto.floor, order: dto.order ?? 0 },
    });
  }

  async updateZone(siteId: string, zoneId: string, dto: { label?: string; floor?: string; order?: number; completed?: boolean }) {
    this.ensureExists(siteId);
    const existing = await this.prisma.siteZone.findFirst({ where: { id: zoneId, siteId } });
    if (!existing) {
      throw new NotFoundException('Zone introuvable');
    }
    return this.prisma.siteZone.update({ where: { id: zoneId }, data: dto });
  }

  async removeZone(siteId: string, zoneId: string) {
    this.ensureExists(siteId);
    const existing = await this.prisma.siteZone.findFirst({ where: { id: zoneId, siteId } });
    if (!existing) {
      throw new NotFoundException('Zone introuvable');
    }
    await this.prisma.siteZone.delete({ where: { id: zoneId } });
    return { deleted: true };
  }

  async setPlanImage(siteId: string, planImageUrl: string | null) {
    this.ensureExists(siteId);
    return this.prisma.site.update({ where: { id: siteId }, data: { planImageUrl } });
  }

  async getQrCode(siteId: string) {
    this.ensureExists(siteId);
    let site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site!.qrSecret) {
      site = await this.prisma.site.update({
        where: { id: siteId },
        data: { qrSecret: randomBytes(12).toString('hex') },
      });
    }
    const payload = `${siteId}:${site!.qrSecret}`;
    const qrCodeDataUrl = await QRCode.toDataURL(payload);
    return { siteId, code: payload, qrCodeDataUrl };
  }

  async validateQrCode(siteId: string, code?: string): Promise<boolean> {
    if (!code) return false;
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site?.qrSecret) return false;
    return code === `${siteId}:${site.qrSecret}`;
  }

  async getIncidentTimeline(siteId: string) {
    this.ensureExists(siteId);
    const anomalies = await this.prisma.anomaly.findMany({
      where: { intervention: { siteId } },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { firstName: true, lastName: true } }, intervention: { select: { date: true } } },
    });
    return anomalies.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      description: a.description,
      status: a.status,
      createdAt: a.createdAt,
      interventionDate: a.intervention.date,
      reportedBy: `${a.user.firstName} ${a.user.lastName}`.trim(),
    }));
  }

  async getQualityScore(siteId: string) {
    this.ensureExists(siteId);
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [interventions, anomalies] = await Promise.all([
      this.prisma.intervention.findMany({
        where: { siteId, date: { gte: since }, status: { in: ['COMPLETED', 'NEEDS_REVIEW', 'NO_SHOW'] } },
        select: { status: true },
      }),
      this.prisma.anomaly.count({ where: { intervention: { siteId }, createdAt: { gte: since } } }),
    ]);
    const total = interventions.length;
    const completed = interventions.filter((i) => i.status === 'COMPLETED').length;
    const noShow = interventions.filter((i) => i.status === 'NO_SHOW').length;
    const completionRate = total > 0 ? completed / total : 1;
    const anomalyPenalty = Math.min(anomalies * 3, 40);
    const noShowPenalty = Math.min(noShow * 5, 20);
    const score = Math.max(0, Math.round(completionRate * 100 - anomalyPenalty - noShowPenalty));
    return {
      siteId,
      periodDays: 90,
      score,
      interventionsTotal: total,
      interventionsCompleted: completed,
      noShowCount: noShow,
      anomalyCount: anomalies,
    };
  }

  /**
   * Envoie par email au contact du site son planning des `periodWeeks` prochaines semaines
   * (résumé HTML + pièce jointe .ics). Ne porte que sur des interventions déjà réelles
   * (jamais une proposition de lot en attente de validation) : le client ne doit jamais voir un
   * planning pas encore approuvé par l'admin.
   */
  async sendPlanning(id: string, periodWeeks: number, actorId = 'system') {
    const site = this.ensureExists(id);
    if (!site.contactEmail) {
      throw new BadRequestException("Aucun email de contact n'est renseigné pour ce site.");
    }
    const from = new Date();
    const to = new Date(from.getTime() + periodWeeks * 7 * 24 * 60 * 60 * 1000);
    const interventions = await this.prisma.intervention.findMany({
      where: { siteId: id, date: { gte: from, lte: to }, status: { notIn: ['CANCELLED'] } },
      orderBy: { date: 'asc' },
    });
    if (!interventions.length) {
      throw new BadRequestException("Aucune intervention planifiée sur cette période pour ce site.");
    }

    const ics = buildIcs(site.name, interventions);
    const html = this.buildPlanningEmailHtml(site.name, interventions, periodWeeks);
    await this.mailerService.send(site.contactEmail, `Planning ${site.name} — ${periodWeeks} prochaine(s) semaine(s)`, html, {
      filename: 'planning.ics',
      content: ics,
      type: 'text/calendar',
    });

    this.auditService.record({
      actorId,
      action: 'SEND_CLIENT_PLANNING',
      entityType: 'site',
      entityId: id,
      details: `${interventions.length} intervention(s) envoyée(s) à ${site.contactEmail}`,
    });

    return { sent: true, count: interventions.length, to: site.contactEmail };
  }

  private buildPlanningEmailHtml(
    siteName: string,
    interventions: { date: Date; startTime: string; endTime: string; label: string | null }[],
    periodWeeks: number,
  ) {
    const rows = interventions
      .map((i) => {
        const dateLabel = i.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        return `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${dateLabel}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${i.startTime} – ${i.endTime}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${i.label ?? 'Intervention'}</td></tr>`;
      })
      .join('');
    return `
      <div style="font-family:sans-serif;color:#132420;">
        <h2>Planning — ${siteName}</h2>
        <p>Voici les interventions prévues pour les ${periodWeeks} prochaine(s) semaine(s). Un fichier .ics est joint pour l'importer dans votre agenda.</p>
        <table style="border-collapse:collapse;width:100%;max-width:600px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #0E8E7C;">Date</th>
              <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #0E8E7C;">Horaire</th>
              <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #0E8E7C;">Intervention</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#5C6864;font-size:13px;margin-top:24px;">Madypro Clean</p>
      </div>
    `;
  }
}
