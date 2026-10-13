import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SupervisorScopeService, Viewer } from '../common/supervisor-scope/supervisor-scope.service';
import { parisDateTime, parisToday } from '../common/utils/paris-time';

/** Où en est un agent aujourd'hui, vu de ses missions sur les sites du superviseur. */
export type AgentDayStatus = 'ON_SITE' | 'LATE' | 'PLANNED' | 'DONE' | 'ABSENT' | 'OFF';

export type TeamAgent = {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  today: { status: AgentDayStatus; siteName?: string; startTime?: string; endTime?: string };
  /** Certifications expirées ou expirant dans les 30 jours. */
  expiringCertifications: number;
};

export type AgentFile = {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  active: boolean;
  today: TeamAgent['today'];
  /** Minutes prévues (missions) et pointées (arrivée → départ), sur les sites du superviseur. */
  hours: { week: { planned: number; worked: number }; month: { planned: number; worked: number } };
  certifications: Array<{ id: string; label: string; obtainedAt: string | null; expiresAt: string | null }>;
  upcoming: Array<{
    interventionId: string;
    date: string;
    startTime: string;
    endTime: string;
    siteId: string;
    siteName: string;
    status: string;
  }>;
  absences: Array<{ id: string; type: string; status: string; from: string; to: string }>;
  sites: Array<{ id: string; name: string }>;
};

export type SiteFile = {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  timeWindow: string | null;
  accessInstructions: string | null;
  accessCode: string | null;
  contact: { name: string | null; phone: string | null; email: string | null };
  checklists: Array<{ id: string; label: string; startTime: string; endTime: string; items: Array<{ id: string; label: string }> }>;
  incidents: Array<{
    id: string;
    type: string;
    title: string | null;
    description: string;
    status: string;
    createdAt: string;
    reportedBy: string;
  }>;
  today: Array<{
    interventionId: string;
    startTime: string;
    endTime: string;
    status: string;
    agents: Array<{ id: string; name: string }>;
  }>;
  /** Agents passés sur le site ces 30 derniers jours ou prévus dans les 14 prochains. */
  team: Array<{ id: string; name: string; phone: string | null }>;
};

const DAY_MS = 86_400_000;
const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();
const dayStart = (day: string) => new Date(`${day}T00:00:00.000Z`);
const dayEnd = (day: string) => new Date(`${day}T23:59:59.999Z`);
const addDays = (day: string, n: number) => new Date(dayStart(day).getTime() + n * DAY_MS).toISOString().slice(0, 10);
const minutesBetween = (start: string, end: string) => {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map((v) => parseInt(v, 10) || 0);
    return h * 60 + m;
  };
  const diff = toMin(end) - toMin(start);
  return diff >= 0 ? diff : diff + 24 * 60; // mission de nuit qui passe minuit
};

type DayMission = {
  status: string;
  startTime: string;
  endTime: string;
  siteName: string;
  tolerance: number;
  checkIn?: Date | null;
  checkOut?: Date | null;
};

/**
 * Annuaire de la tablette superviseur : équipe, fiche agent et fiche site, limités au périmètre
 * du superviseur (ses sites, les agents déjà affectés à ses sites). L'admin voit tout.
 */
@Injectable()
export class SupervisionDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly scope: SupervisorScopeService,
  ) {}

  async team(viewer: Viewer, now: Date = new Date()): Promise<TeamAgent[]> {
    const day = parisToday(now);
    const agentIds = await this.scope.agentIds(viewer);
    const siteIds = await this.scope.siteIds(viewer);
    const agents = await this.prisma.user.findMany({
      where: { role: 'AGENT', active: true, ...(agentIds ? { id: { in: [...agentIds] } } : {}) },
      select: { id: true, firstName: true, lastName: true, phone: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    if (!agents.length) return [];
    const ids = agents.map((a) => a.id);
    const soon = new Date(now.getTime() + 30 * DAY_MS);
    const [missions, absent, certifications] = await Promise.all([
      this.dayMissions(day, ids, siteIds),
      this.absentOn(day, ids),
      this.prisma.certification.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, expiresAt: { not: null, lte: soon } },
        _count: { _all: true },
      }),
    ]);
    const expiring = new Map(certifications.map((c) => [c.userId, c._count._all]));
    return agents.map((agent) => ({
      id: agent.id,
      name: fullName(agent),
      phone: agent.phone || null,
      email: agent.email,
      today: this.dayStatus(day, now, missions.get(agent.id) ?? [], absent.has(agent.id)),
      expiringCertifications: expiring.get(agent.id) ?? 0,
    }));
  }

  async agentFile(viewer: Viewer, agentId: string, now: Date = new Date()): Promise<AgentFile> {
    await this.scope.assertAgent(viewer, agentId);
    const agent = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        active: true,
        role: true,
        certifications: { orderBy: { expiresAt: 'asc' } },
      },
    });
    if (!agent || agent.role !== 'AGENT') throw new NotFoundException('Agent introuvable');

    const siteIds = await this.scope.siteIds(viewer);
    const siteFilter = siteIds ? { siteId: { in: siteIds } } : {};
    const day = parisToday(now);
    const weekday = (dayStart(day).getUTCDay() + 6) % 7; // lundi = 0
    const weekFrom = addDays(day, -weekday);
    const weekTo = addDays(weekFrom, 6);
    const monthFrom = `${day.slice(0, 7)}-01`;
    const nextMonth = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 1)).toISOString().slice(0, 10);
    const monthTo = addDays(nextMonth, -1);
    const periodFrom = weekFrom < monthFrom ? weekFrom : monthFrom;
    const periodTo = weekTo > monthTo ? weekTo : monthTo;

    const [assignments, upcoming, absences, missions, absentToday, siteLinks] = await Promise.all([
      this.prisma.interventionAssignment.findMany({
        where: {
          userId: agentId,
          intervention: { ...siteFilter, status: { not: 'CANCELLED' }, date: { gte: dayStart(periodFrom), lte: dayEnd(periodTo) } },
        },
        select: {
          intervention: {
            select: {
              date: true,
              startTime: true,
              endTime: true,
              attendances: { where: { userId: agentId }, select: { checkInTime: true, checkOutTime: true } },
            },
          },
        },
      }),
      this.prisma.intervention.findMany({
        where: {
          ...siteFilter,
          assignments: { some: { userId: agentId } },
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          date: { gte: dayStart(day), lte: dayEnd(addDays(day, 13)) },
        },
        select: { id: true, date: true, startTime: true, endTime: true, status: true, siteId: true, site: { select: { name: true } } },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        take: 20,
      }),
      this.prisma.absence.findMany({
        where: {
          userId: agentId,
          OR: [{ status: 'PENDING' }, { status: 'APPROVED', to: { gte: dayStart(day) } }],
        },
        select: { id: true, type: true, status: true, from: true, to: true },
        orderBy: { from: 'asc' },
        take: 10,
      }),
      this.dayMissions(day, [agentId], siteIds),
      this.absentOn(day, [agentId]),
      this.prisma.intervention.findMany({
        where: { ...siteFilter, assignments: { some: { userId: agentId } } },
        select: { site: { select: { id: true, name: true } } },
        distinct: ['siteId'],
      }),
    ]);

    const hours = { week: { planned: 0, worked: 0 }, month: { planned: 0, worked: 0 } };
    for (const { intervention } of assignments) {
      const date = intervention.date.toISOString().slice(0, 10);
      const planned = minutesBetween(intervention.startTime, intervention.endTime);
      const worked = intervention.attendances.reduce(
        (sum, a) =>
          a.checkInTime && a.checkOutTime
            ? sum + Math.max(0, Math.round((a.checkOutTime.getTime() - a.checkInTime.getTime()) / 60_000))
            : sum,
        0,
      );
      if (date >= weekFrom && date <= weekTo) {
        hours.week.planned += planned;
        hours.week.worked += worked;
      }
      if (date >= monthFrom && date <= monthTo) {
        hours.month.planned += planned;
        hours.month.worked += worked;
      }
    }

    return {
      id: agent.id,
      name: fullName(agent),
      phone: agent.phone || null,
      email: agent.email,
      active: agent.active,
      today: this.dayStatus(day, now, missions.get(agentId) ?? [], absentToday.has(agentId)),
      hours,
      certifications: agent.certifications.map((c) => ({
        id: c.id,
        label: c.label,
        obtainedAt: c.obtainedAt ? c.obtainedAt.toISOString().slice(0, 10) : null,
        expiresAt: c.expiresAt ? c.expiresAt.toISOString().slice(0, 10) : null,
      })),
      upcoming: upcoming.map((i) => ({
        interventionId: i.id,
        date: i.date.toISOString().slice(0, 10),
        startTime: i.startTime,
        endTime: i.endTime,
        siteId: i.siteId,
        siteName: i.site.name,
        status: i.status,
      })),
      absences: absences.map((a) => ({
        id: a.id,
        type: a.type,
        status: a.status,
        from: a.from.toISOString().slice(0, 10),
        to: a.to.toISOString().slice(0, 10),
      })),
      sites: siteLinks.map((l) => l.site).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    };
  }

  async siteFile(viewer: Viewer, siteId: string, now: Date = new Date()): Promise<SiteFile> {
    await this.scope.assertSite(viewer, siteId);
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      include: {
        categories: {
          where: { active: true },
          include: { category: { select: { label: true } }, checklist: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
          orderBy: { startTime: 'asc' },
        },
      },
    });
    if (!site) throw new NotFoundException('Site introuvable');
    const day = parisToday(now);
    const since = new Date(now.getTime() - 30 * DAY_MS);

    const [incidents, todayMissions, recent] = await Promise.all([
      this.prisma.anomaly.findMany({
        where: { intervention: { siteId }, OR: [{ status: 'NEW' }, { createdAt: { gte: since } }] },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.intervention.findMany({
        where: { siteId, status: { not: 'CANCELLED' }, date: { gte: dayStart(day), lte: dayEnd(day) } },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          status: true,
          assignments: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
        },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.interventionAssignment.findMany({
        where: {
          intervention: {
            siteId,
            status: { not: 'CANCELLED' },
            date: { gte: dayStart(addDays(day, -30)), lte: dayEnd(addDays(day, 14)) },
          },
          user: { active: true },
        },
        select: { user: { select: { id: true, firstName: true, lastName: true, phone: true } } },
        distinct: ['userId'],
      }),
    ]);

    return {
      id: site.id,
      name: site.name,
      address: site.address,
      latitude: site.latitude,
      longitude: site.longitude,
      timeWindow: site.timeWindow,
      accessInstructions: site.accessInstructions,
      accessCode: site.accessCode,
      contact: { name: site.contactName, phone: site.contactPhone, email: site.contactEmail },
      checklists: site.categories.map((c) => ({
        id: c.id,
        label: c.category.label,
        startTime: c.startTime,
        endTime: c.endTime,
        items: c.checklist.map((item) => ({ id: item.id, label: item.label })),
      })),
      // Incidents encore ouverts d'abord, puis les plus récents.
      incidents: incidents
        .sort((a, b) => Number(b.status === 'NEW') - Number(a.status === 'NEW'))
        .map((a) => ({
          id: a.id,
          type: a.type,
          title: a.title,
          description: a.description,
          status: a.status,
          createdAt: a.createdAt.toISOString(),
          reportedBy: fullName(a.user),
        })),
      today: todayMissions.map((i) => ({
        interventionId: i.id,
        startTime: i.startTime,
        endTime: i.endTime,
        status: i.status,
        agents: i.assignments.map((a) => ({ id: a.user.id, name: fullName(a.user) })),
      })),
      team: recent
        .map((a) => ({ id: a.user.id, name: fullName(a.user), phone: a.user.phone || null }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    };
  }

  /** Missions du jour par agent, sur les sites du périmètre (`null` = tous les sites). */
  private async dayMissions(day: string, agentIds: string[], siteIds: string[] | null) {
    const interventions = await this.prisma.intervention.findMany({
      where: {
        ...(siteIds ? { siteId: { in: siteIds } } : {}),
        status: { not: 'CANCELLED' },
        date: { gte: dayStart(day), lte: dayEnd(day) },
        assignments: { some: { userId: { in: agentIds } } },
      },
      select: {
        status: true,
        startTime: true,
        endTime: true,
        site: { select: { name: true, toleranceMinutes: true } },
        assignments: { select: { userId: true } },
        attendances: { select: { userId: true, checkInTime: true, checkOutTime: true } },
      },
      orderBy: { startTime: 'asc' },
    });
    const defaultTolerance = this.settings.getSettings().attendanceRules.toleranceMinutes ?? 10;
    const byAgent = new Map<string, DayMission[]>();
    for (const i of interventions) {
      for (const { userId } of i.assignments) {
        if (!agentIds.includes(userId)) continue;
        const attendance = i.attendances.find((a) => a.userId === userId);
        const list = byAgent.get(userId) ?? [];
        list.push({
          status: i.status,
          startTime: i.startTime,
          endTime: i.endTime,
          siteName: i.site.name,
          tolerance: i.site.toleranceMinutes ?? defaultTolerance,
          checkIn: attendance?.checkInTime,
          checkOut: attendance?.checkOutTime,
        });
        byAgent.set(userId, list);
      }
    }
    return byAgent;
  }

  private async absentOn(day: string, agentIds: string[]) {
    const absences = await this.prisma.absence.findMany({
      where: { userId: { in: agentIds }, status: 'APPROVED', from: { lte: dayEnd(day) }, to: { gte: dayStart(day) } },
      select: { userId: true },
    });
    return new Set(absences.map((a) => a.userId));
  }

  /**
   * Statut du jour : absent > sur place (arrivé, pas reparti) > en retard (début + tolérance
   * dépassé sans pointage) > prochaine mission prévue > journée terminée > pas de mission.
   */
  private dayStatus(day: string, now: Date, missions: DayMission[], absent: boolean): TeamAgent['today'] {
    if (absent) return { status: 'ABSENT' };
    if (!missions.length) return { status: 'OFF' };
    const pick = (m: DayMission) => ({ siteName: m.siteName, startTime: m.startTime, endTime: m.endTime });
    const onSite = missions.find((m) => m.checkIn && !m.checkOut);
    if (onSite) return { status: 'ON_SITE', ...pick(onSite) };
    const open = missions.filter((m) => !m.checkIn && ['PLANNED', 'IN_PROGRESS'].includes(m.status));
    const late = open.find((m) => now.getTime() >= parisDateTime(day, m.startTime).getTime() + m.tolerance * 60_000);
    if (late) return { status: 'LATE', ...pick(late) };
    if (open.length) return { status: 'PLANNED', ...pick(open[0]) };
    return { status: 'DONE', ...pick(missions[missions.length - 1]) };
  }
}
