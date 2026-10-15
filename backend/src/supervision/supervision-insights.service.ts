import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SupervisorScopeService, Viewer } from '../common/supervisor-scope/supervisor-scope.service';
import { parisDateTime, parisToday } from '../common/utils/paris-time';

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();
const dayStart = (day: string) => new Date(`${day}T00:00:00.000Z`);
const dayEnd = (day: string) => new Date(`${day}T23:59:59.999Z`);
const minutes = (start: string, end: string) => {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : diff + 24 * 60;
};

/** Grille de contrôle qualité par défaut (libellés simples, notés Bien / Moyen / À reprendre). */
export const QUALITY_CRITERIA = [
  'Sols',
  'Plans de travail et surfaces',
  'Cuisine (hottes, fours, friteuses)',
  'Sanitaires',
  'Poubelles et local déchets',
  'Vitres et miroirs',
  'Rangement du matériel',
];

const RATING_POINTS: Record<string, number> = { GOOD: 100, AVERAGE: 50, POOR: 0 };

export type QualityItemInput = { label: string; rating: 'GOOD' | 'AVERAGE' | 'POOR'; comment?: string };

/**
 * Vues de synthèse du superviseur : bilan de fin de journée, historique d'un site et contrôles
 * qualité, toujours limités à ses sites (l'administrateur voit tout).
 */
@Injectable()
export class SupervisionInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly scope: SupervisorScopeService,
  ) {}

  /** Bilan d'une journée : missions faites, retards, heures, anomalies, absences, reste à valider. */
  async daySummary(viewer: Viewer, date?: string, now: Date = new Date()) {
    const day = date ?? parisToday(now);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new BadRequestException('date attendue au format YYYY-MM-DD');
    const siteIds = await this.scope.siteIds(viewer);
    const siteFilter: Prisma.InterventionWhereInput = siteIds ? { siteId: { in: siteIds } } : {};
    const interventions = await this.prisma.intervention.findMany({
      where: { ...siteFilter, date: { gte: dayStart(day), lte: dayEnd(day) } },
      include: {
        site: { select: { name: true, toleranceMinutes: true } },
        assignments: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        attendances: { select: { userId: true, checkInTime: true, arrivalTime: true, checkOutTime: true } },
        anomalies: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { startTime: 'asc' },
    });
    const tolerance = this.settings.getSettings().attendanceRules.toleranceMinutes ?? 10;

    const missions = { total: 0, completed: 0, toValidate: 0, inProgress: 0, notDone: 0, upcoming: 0, cancelled: 0 };
    const late: { agentName: string; siteName: string; startTime: string; minutesLate: number }[] = [];
    const toValidate: { interventionId: string; siteName: string; startTime: string; endTime: string }[] = [];
    const notDone: { interventionId: string; siteName: string; startTime: string; agents: string[] }[] = [];
    let plannedMinutes = 0;
    let workedMinutes = 0;
    let arrivals = 0;

    for (const i of interventions) {
      if (i.status === 'CANCELLED') {
        missions.cancelled += 1;
        continue;
      }
      missions.total += 1;
      const ended = now.getTime() > parisDateTime(day, i.endTime).getTime();
      if (i.status === 'COMPLETED') missions.completed += 1;
      else if (i.status === 'NEEDS_REVIEW') {
        missions.toValidate += 1;
        toValidate.push({ interventionId: i.id, siteName: i.site.name, startTime: i.startTime, endTime: i.endTime });
      } else if (i.status === 'IN_PROGRESS') missions.inProgress += 1;
      else if (i.status === 'NO_SHOW' || (i.status === 'PLANNED' && ended)) {
        missions.notDone += 1;
        notDone.push({ interventionId: i.id, siteName: i.site.name, startTime: i.startTime, agents: i.assignments.map((a) => fullName(a.user)) });
      } else missions.upcoming += 1;

      plannedMinutes += minutes(i.startTime, i.endTime) * i.assignments.length;
      const planned = parisDateTime(day, i.startTime).getTime();
      const allowed = (i.site.toleranceMinutes ?? tolerance) * 60_000;
      for (const att of i.attendances) {
        const start = att.checkInTime ?? att.arrivalTime;
        if (!start) continue;
        arrivals += 1;
        if (start.getTime() > planned + allowed) {
          const user = i.assignments.find((a) => a.userId === att.userId)?.user;
          late.push({
            agentName: user ? fullName(user) : 'Agent',
            siteName: i.site.name,
            startTime: i.startTime,
            minutesLate: Math.round((start.getTime() - planned) / 60_000),
          });
        }
        if (att.checkOutTime) workedMinutes += Math.max(0, Math.round((att.checkOutTime.getTime() - start.getTime()) / 60_000));
      }
    }

    const anomalies = interventions
      .flatMap((i) => i.anomalies.map((a) => ({ ...a, siteName: i.site.name })))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const agentIds = [...new Set(interventions.flatMap((i) => i.assignments.map((a) => a.userId)))];
    const absences = agentIds.length
      ? await this.prisma.absence.findMany({
          where: { userId: { in: agentIds }, status: 'APPROVED', from: { lte: dayEnd(day) }, to: { gte: dayStart(day) } },
          include: { user: { select: { firstName: true, lastName: true } } },
        })
      : [];

    return {
      date: day,
      generatedAt: now.toISOString(),
      missions,
      punctuality: {
        arrivals,
        late: late.length,
        onTimeRate: arrivals ? Math.round(((arrivals - late.length) / arrivals) * 100) : null,
      },
      hours: { planned: Math.round(plannedMinutes / 6) / 10, worked: Math.round(workedMinutes / 6) / 10 },
      late: late.sort((a, b) => b.minutesLate - a.minutesLate),
      toValidate,
      notDone,
      anomalies: anomalies.slice(0, 10).map((a) => ({
        id: a.id,
        siteName: a.siteName,
        title: a.title ?? a.type,
        description: a.description,
        status: a.status,
        agentName: fullName(a.user),
      })),
      anomalyCount: { total: anomalies.length, open: anomalies.filter((a) => a.status === 'NEW').length },
      absences: absences.map((a) => ({ agentName: fullName(a.user), type: a.type })),
    };
  }

  /** Dernières missions d'un site (statut, agents, photos, anomalies, observation) et contrôles qualité. */
  async siteHistory(viewer: Viewer, siteId: string, limit = 30) {
    await this.scope.assertSite(viewer, siteId);
    const site = await this.prisma.site.findUnique({ where: { id: siteId }, select: { id: true, name: true } });
    if (!site) throw new NotFoundException('Site introuvable');
    const today = parisToday();
    const [missions, inspections] = await Promise.all([
      this.prisma.intervention.findMany({
        where: { siteId, date: { lte: dayEnd(today) } },
        include: {
          assignments: { include: { user: { select: { firstName: true, lastName: true } } } },
          attendances: { select: { checkInPhoto: true, checkOutPhoto: true } },
          anomalies: { select: { id: true, title: true, type: true, status: true } },
          category: { select: { label: true } },
        },
        orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
        take: Math.min(limit, 100),
      }),
      this.listInspections(viewer, siteId, 10),
    ]);
    return {
      site,
      missions: missions.map((m) => ({
        id: m.id,
        date: m.date.toISOString().slice(0, 10),
        startTime: m.startTime,
        endTime: m.endTime,
        status: m.status,
        prestation: m.category?.label ?? m.subType ?? null,
        agents: m.assignments.map((a) => fullName(a.user)),
        observation: m.observation,
        photoCount:
          m.photos.length + m.attendances.reduce((n, a) => n + (a.checkInPhoto ? 1 : 0) + (a.checkOutPhoto ? 1 : 0), 0),
        anomalies: m.anomalies.map((a) => ({ id: a.id, title: a.title ?? a.type, status: a.status })),
      })),
      inspections,
    };
  }

  async listInspections(viewer: Viewer, siteId: string, take = 20) {
    await this.scope.assertSite(viewer, siteId);
    const rows = await this.prisma.qualityInspection.findMany({
      where: { siteId },
      include: { inspector: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      score: r.score,
      items: r.items as QualityItemInput[],
      comment: r.comment,
      photos: r.photos,
      inspectorName: fullName(r.inspector),
    }));
  }

  /** Enregistre un contrôle qualité ; la note sur 100 est la moyenne des critères notés. */
  async createInspection(
    viewer: Viewer,
    siteId: string,
    dto: { items: QualityItemInput[]; comment?: string; photos?: string[]; interventionId?: string },
  ) {
    await this.scope.assertSite(viewer, siteId);
    const items = (dto.items ?? []).filter((i) => i && i.label && RATING_POINTS[i.rating] !== undefined);
    if (!items.length) throw new BadRequestException('Notez au moins un critère');
    const score = Math.round(items.reduce((n, i) => n + RATING_POINTS[i.rating], 0) / items.length);
    const created = await this.prisma.qualityInspection.create({
      data: {
        siteId,
        inspectorId: SupervisorScopeService.viewerId(viewer),
        interventionId: dto.interventionId ?? null,
        score,
        items: items.map((i) => ({ label: i.label, rating: i.rating, ...(i.comment?.trim() ? { comment: i.comment.trim() } : {}) })),
        comment: dto.comment?.trim() || null,
        photos: (dto.photos ?? []).slice(0, 6),
      },
    });
    return { id: created.id, score, createdAt: created.createdAt };
  }

  /** Note moyenne par site sur 90 jours, avec la tendance (dernier contrôle vs moyenne). */
  async qualityOverview(viewer: Viewer) {
    const siteIds = await this.scope.siteIds(viewer);
    const since = new Date(Date.now() - 90 * 86_400_000);
    const rows = await this.prisma.qualityInspection.findMany({
      where: { createdAt: { gte: since }, ...(siteIds ? { siteId: { in: siteIds } } : {}) },
      include: { site: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const bySite = new Map<string, { siteId: string; siteName: string; scores: number[]; last: Date }>();
    for (const r of rows) {
      const entry = bySite.get(r.siteId) ?? { siteId: r.siteId, siteName: r.site.name, scores: [], last: r.createdAt };
      entry.scores.push(r.score);
      bySite.set(r.siteId, entry);
    }
    return {
      criteria: QUALITY_CRITERIA,
      sites: [...bySite.values()]
        .map((e) => ({
          siteId: e.siteId,
          siteName: e.siteName,
          inspections: e.scores.length,
          average: Math.round(e.scores.reduce((a, b) => a + b, 0) / e.scores.length),
          lastScore: e.scores[0],
          lastAt: e.last,
        }))
        .sort((a, b) => a.average - b.average),
    };
  }
}
