import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SupervisorScopeService, Viewer } from '../common/supervisor-scope/supervisor-scope.service';
import { parisDateTime, parisToday } from '../common/utils/paris-time';

export type TodayTask =
  | {
      kind: 'LATE';
      interventionId: string;
      siteId: string;
      siteName: string;
      startTime: string;
      agentId: string;
      agentName: string;
      agentPhone: string | null;
    }
  | {
      kind: 'TO_VALIDATE';
      interventionId: string;
      siteId: string;
      siteName: string;
      startTime: string;
      endTime: string;
      agentCount: number;
    }
  | { kind: 'ABSENCE'; absenceId: string; agentId: string; agentName: string; type: string; from: string; to: string }
  | { kind: 'UNCOVERED'; interventionId: string; siteId: string; siteName: string; startTime: string };

export type SupervisorToday = {
  date: string;
  generatedAt: string;
  siteCount: number;
  agents: { expected: number; present: number; late: number; absent: number };
  missions: { total: number; planned: number; inProgress: number; toValidate: number; completed: number; notStarted: number };
  tasks: TodayTask[];
};

const ACTIVE_STATUSES = ['PLANNED', 'IN_PROGRESS'];

/**
 * Situation du jour d'un superviseur (écran « Aujourd'hui » de la tablette), calculée sur ses
 * seuls sites ; l'admin obtient la même synthèse sur tous les sites.
 */
@Injectable()
export class SupervisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly scope: SupervisorScopeService,
  ) {}

  async today(viewer: Viewer, date?: string, now: Date = new Date()): Promise<SupervisorToday> {
    const day = date ?? parisToday(now);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new BadRequestException('date attendue au format YYYY-MM-DD');
    // Appels groupés : chaque aller-retour vers la base compte (base distante).
    const [siteIds, agentIds] = await Promise.all([this.scope.siteIds(viewer), this.scope.agentIds(viewer)]);
    const siteFilter: Prisma.InterventionWhereInput = siteIds ? { siteId: { in: siteIds } } : {};
    const dayStart = new Date(`${day}T00:00:00.000Z`);
    const dayEnd = new Date(`${day}T23:59:59.999Z`);

    const [interventions, siteCount, pendingAbsences] = await Promise.all([
      this.prisma.intervention.findMany({
        where: { ...siteFilter, date: { gte: dayStart, lte: dayEnd }, status: { not: 'CANCELLED' } },
        include: {
          site: { select: { id: true, name: true, toleranceMinutes: true } },
          assignments: { include: { user: { select: { id: true, firstName: true, lastName: true, phone: true } } } },
          attendances: { select: { userId: true, checkInTime: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      siteIds ? Promise.resolve(siteIds.length) : this.prisma.site.count({ where: { active: true } }),
      // Demandes d'absence en attente de l'équipe (toutes dates).
      this.prisma.absence.findMany({
        where: { status: 'PENDING', ...(agentIds ? { userId: { in: [...agentIds] } } : {}) },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { from: 'asc' },
        take: 20,
      }),
    ]);

    const expected = new Set<string>();
    interventions.forEach((i) => i.assignments.forEach((a) => expected.add(a.userId)));

    // Absences validées couvrant ce jour, pour les agents attendus.
    const approvedAbsences = expected.size
      ? await this.prisma.absence.findMany({
          where: { userId: { in: [...expected] }, status: 'APPROVED', from: { lte: dayEnd }, to: { gte: dayStart } },
          select: { userId: true },
        })
      : [];
    const absent = new Set(approvedAbsences.map((a) => a.userId));

    const defaultTolerance = this.settings.getSettings().attendanceRules.toleranceMinutes ?? 10;
    const present = new Set<string>();
    const late = new Set<string>();
    const tasks: TodayTask[] = [];
    const counts = { total: interventions.length, planned: 0, inProgress: 0, toValidate: 0, completed: 0, notStarted: 0 };

    for (const intervention of interventions) {
      const tolerance = intervention.site.toleranceMinutes ?? defaultTolerance;
      const lateSince = parisDateTime(day, intervention.startTime).getTime() + tolerance * 60_000;
      const checkedIn = new Set(intervention.attendances.filter((a) => a.checkInTime).map((a) => a.userId));
      checkedIn.forEach((id) => present.add(id));
      const available = intervention.assignments.filter((a) => !absent.has(a.userId));
      const isActive = ACTIVE_STATUSES.includes(intervention.status);
      const startPassed = now.getTime() >= lateSince;

      if (intervention.status === 'COMPLETED') counts.completed += 1;
      else if (intervention.status === 'NEEDS_REVIEW') counts.toValidate += 1;
      else if (intervention.status === 'IN_PROGRESS') counts.inProgress += 1;
      else if (intervention.status === 'NO_SHOW' || (intervention.status === 'PLANNED' && startPassed && !checkedIn.size))
        counts.notStarted += 1;
      else counts.planned += 1;

      if (intervention.status === 'NEEDS_REVIEW') {
        tasks.push({
          kind: 'TO_VALIDATE',
          interventionId: intervention.id,
          siteId: intervention.siteId,
          siteName: intervention.site.name,
          startTime: intervention.startTime,
          endTime: intervention.endTime,
          agentCount: intervention.assignments.length,
        });
      }
      if (isActive && !available.length) {
        tasks.push({
          kind: 'UNCOVERED',
          interventionId: intervention.id,
          siteId: intervention.siteId,
          siteName: intervention.site.name,
          startTime: intervention.startTime,
        });
        continue;
      }
      if (!isActive || !startPassed) continue;
      for (const assignment of available) {
        if (checkedIn.has(assignment.userId)) continue;
        late.add(assignment.userId);
        tasks.push({
          kind: 'LATE',
          interventionId: intervention.id,
          siteId: intervention.siteId,
          siteName: intervention.site.name,
          startTime: intervention.startTime,
          agentId: assignment.userId,
          agentName: `${assignment.user.firstName} ${assignment.user.lastName}`.trim(),
          agentPhone: assignment.user.phone || null,
        });
      }
    }

    for (const absence of pendingAbsences) {
      tasks.push({
        kind: 'ABSENCE',
        absenceId: absence.id,
        agentId: absence.userId,
        agentName: `${absence.user.firstName} ${absence.user.lastName}`.trim(),
        type: absence.type,
        from: absence.from.toISOString().slice(0, 10),
        to: absence.to.toISOString().slice(0, 10),
      });
    }

    // Ordre de traitement : ce qui bloque le terrain d'abord.
    const priority: Record<TodayTask['kind'], number> = { UNCOVERED: 0, LATE: 1, TO_VALIDATE: 2, ABSENCE: 3 };
    tasks.sort((a, b) => priority[a.kind] - priority[b.kind]);

    return {
      date: day,
      generatedAt: now.toISOString(),
      siteCount,
      agents: {
        expected: expected.size,
        present: present.size,
        late: [...late].filter((id) => !present.has(id)).length,
        absent: [...absent].filter((id) => expected.has(id)).length,
      },
      missions: counts,
      tasks,
    };
  }
}
