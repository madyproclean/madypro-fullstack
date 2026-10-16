import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { frenchPublicHolidays } from '../common/utils/french-holidays';
import { parisDateTime } from '../common/utils/paris-time';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { MailerService } from '../notifications/mailer.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { computeTotals } from '../documents/line-items.util';
import { DocumentPdfService } from '../documents/document-pdf.service';

@Injectable()
export class ReportsService implements OnModuleInit {
  private readonly logger = new Logger(ReportsService.name);
  private lastWeeklySent: string | null = null;
  private lastMonthlySent: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly mailer: MailerService,
    private readonly webhooksService: WebhooksService,
    private readonly documentPdfService: DocumentPdfService,
  ) {}

  private static readonly SCHEDULE_STATE_KEY = 'reportScheduleState';

  async onModuleInit() {
    // Persisté (au lieu de rester en mémoire) : sinon chaque redémarrage du conteneur
    // (déploiement) réinitialise ces garde-fous et peut renvoyer un rapport déjà envoyé
    // le même jour (constaté : 3 "Rapport hebdomadaire" en double le même lundi, un par
    // redéploiement survenu après plus d'une heure d'exécution du précédent).
    const row = await this.prisma.setting.findUnique({ where: { key: ReportsService.SCHEDULE_STATE_KEY } });
    if (row?.value) {
      const state = row.value as unknown as { lastWeeklySent?: string; lastMonthlySent?: string };
      this.lastWeeklySent = state.lastWeeklySent ?? null;
      this.lastMonthlySent = state.lastMonthlySent ?? null;
    }
    setInterval(() => {
      this.checkScheduledReports().catch((err) =>
        this.logger.warn(`Erreur envoi programmé des rapports: ${err?.message || err}`),
      );
    }, 60 * 60 * 1000); // toutes les heures
  }

  private async persistScheduleState() {
    await this.prisma.setting.upsert({
      where: { key: ReportsService.SCHEDULE_STATE_KEY },
      update: { value: { lastWeeklySent: this.lastWeeklySent, lastMonthlySent: this.lastMonthlySent } },
      create: {
        key: ReportsService.SCHEDULE_STATE_KEY,
        value: { lastWeeklySent: this.lastWeeklySent, lastMonthlySent: this.lastMonthlySent },
      },
    });
  }

  private async checkScheduledReports() {
    const now = new Date();
    const hour = now.getHours();
    if (hour < 8) return;

    const isoWeek = this.isoWeekKey(now);
    if (now.getDay() === 1 && this.lastWeeklySent !== isoWeek) {
      this.lastWeeklySent = isoWeek;
      await this.persistScheduleState();
      const end = now.toISOString().slice(0, 10);
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await this.sendReportEmail(start, end, 'Rapport hebdomadaire');
    }

    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (now.getDate() === 1 && this.lastMonthlySent !== monthKey) {
      this.lastMonthlySent = monthKey;
      await this.persistScheduleState();
      const end = now.toISOString().slice(0, 10);
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await this.sendReportEmail(start, end, 'Rapport mensuel');
    }
  }

  async sendReportEmail(
    startDate: string,
    endDate: string,
    label = 'Rapport',
  ): Promise<{ recipients: number; sent: number; failed: number }> {
    const [report, csv, admins] = await Promise.all([
      this.performance(startDate, endDate),
      this.payrollCsv(startDate, endDate),
      this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPERVISOR'] }, active: true } }),
    ]);

    const html = `
      <h2>${label} — ${startDate} au ${endDate}</h2>
      <p>Heures réalisées : ${(report.kpis.realizedMinutes / 60).toFixed(1)} h
        (planifiées : ${(report.kpis.plannedMinutes / 60).toFixed(1)} h,
        taux de réalisation : ${report.kpis.realizationRate ?? '—'}%)</p>
      <p>Ponctualité : ${report.kpis.punctualityRate ?? '—'}%</p>
      <p>Absentéisme : ${report.kpis.absenteeismRate ?? '—'}%</p>
      <p>${report.agentReports.length} agent(s) actif(s) sur la période, ${report.siteReports.length} site(s) couvert(s).</p>
      <p>Le détail heures normales/majorées par agent est joint en pièce attachée.</p>
    `;

    const results = await Promise.all(
      admins.map((admin) =>
        this.mailer
          .send(admin.email, `${label} Madypro Clean — ${startDate} au ${endDate}`, html, {
            filename: `export-paie-${startDate}-${endDate}.csv`,
            content: csv,
          })
          .then(() => true)
          .catch((err) => {
            this.logger.warn(`Envoi rapport échoué pour ${admin.email}: ${err?.message || err}`);
            return false;
          }),
      ),
    );

    const sent = results.filter(Boolean).length;
    return { recipients: admins.length, sent, failed: admins.length - sent };
  }

  private parseDate(value: string, label: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${label} invalide : "${value}"`);
    }
    return parsed;
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  private endOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  }

  private combine(dateStr: string, time: string) {
    return new Date(`${dateStr}T${time}:00`);
  }

  async summary(date?: string) {
    const today = new Date();
    const target = date ? this.parseDate(date, 'date') : today;
    const defaultDate = target.toISOString().substring(0, 10);
    const start = this.startOfDay(target);
    const end = this.endOfDay(target);

    const [interventions, attendance] = await Promise.all([
      this.prisma.intervention.findMany({
        where: { date: { gte: start, lte: end } },
        include: {
          assignments: { include: { user: true } },
          site: { include: { supervisors: { include: { user: true } } } },
        },
      }),
      this.prisma.attendance.findMany({
        where: { date: { gte: start, lte: end } },
        include: { user: true, intervention: { include: { site: true } } },
      }),
    ]);

    const attendanceMap = new Map<string, { checkIn?: string; status?: string }>();
    attendance.forEach((att) => {
      const siteId = (att as any).intervention?.siteId;
      if (!att.userId || !siteId) return;
      const key = `${att.userId}::${siteId}`;
      // toISOString().slice(11, 16) renverrait l'heure UTC brute (décalée vs l'heure de Paris affichée
      // partout ailleurs, cf. attendance.service.ts#formatTime) — même correctif ici.
      const checkIn = att.checkInTime
        ? new Date(att.checkInTime).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
        : undefined;
      const status = att.status;
      attendanceMap.set(key, { checkIn, status });
    });

    const planning = interventions.flatMap((intervention) => {
      const siteName = intervention.site.name;
      const supervisors = intervention.site.supervisors.map((s) => `${s.user.firstName} ${s.user.lastName}`.trim());
      return intervention.assignments.map((assign) => {
        const agent = `${assign.user.firstName} ${assign.user.lastName}`.trim();
        const key = `${assign.userId}::${intervention.siteId}`;
        const attendanceInfo = attendanceMap.get(key);
        const plannedStart = this.combine(intervention.date.toISOString().slice(0, 10), intervention.startTime);
        const status =
          attendanceInfo?.status === 'CANCELLED'
            ? 'ABSENT'
            : attendanceInfo?.checkIn
            ? new Date(`${defaultDate}T${attendanceInfo.checkIn}:00`) > plannedStart
              ? 'LATE'
              : 'ON_TIME'
            : 'ABSENT';
        return {
          id: `${intervention.id}-${assign.userId}`,
          agent,
          supervisor: supervisors.join(', ') || '—',
          site: siteName,
          planned: true,
          checkIn: attendanceInfo?.checkIn,
          status,
        };
      });
    });

    const filterOptions = {
      sites: Array.from(new Set(planning.map((p) => p.site))),
      supervisors: Array.from(new Set(planning.map((p) => p.supervisor).filter(Boolean))),
    };

    const alerts = planning
      .filter((p) => p.status === 'ABSENT')
      .map((p, idx) => ({
        id: `alert-${idx}`,
        type: 'Absence',
        description: `${p.agent} · ${p.site}`,
        site: p.site,
        supervisor: p.supervisor,
        agent: p.agent,
        severity: 'warning' as const,
      }));

    const metrics = [
      { title: 'Agents planifiés', value: planning.filter((record) => record.planned).length },
      { title: 'Agents pointés', value: planning.filter((record) => record.checkIn).length },
      { title: 'Agents absents', value: planning.filter((record) => record.status === 'ABSENT').length },
      {
        title: 'Sites impactés',
        value: new Set(planning.filter((record) => record.status === 'ABSENT').map((record) => record.site)).size,
      },
    ];

    return {
      defaultDate,
      filterOptions,
      metrics,
      planning,
      alerts,
    };
  }

  async performance(startDate?: string, endDate?: string) {
    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const defaultStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const period = {
      startDate: startDate ?? defaultStart,
      endDate: endDate ?? defaultEnd,
    };

    const start = this.startOfDay(this.parseDate(period.startDate, 'startDate'));
    const end = this.endOfDay(this.parseDate(period.endDate, 'endDate'));

    const [attendances, absences, interventions] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { date: { gte: start, lte: end } },
        include: { user: true, intervention: { include: { site: true } } },
      }),
      this.prisma.absence.findMany({
        where: { from: { lte: end }, to: { gte: start } },
        include: { user: true },
      }),
      this.prisma.intervention.findMany({
        where: { date: { gte: start, lte: end } },
        include: { site: true, assignments: true },
      }),
    ]);

    const toleranceMinutes = this.settingsService.getSettings().attendanceRules.toleranceMinutes ?? 10;

    const minutesBetween = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / 60000);

    type AgentAgg = {
      id: string;
      name: string;
      totalMinutes: number;
      workingDays: Set<string>;
      absenceMinutes: number;
    };
    const agentMap = new Map<string, AgentAgg>();
    const ensureAgent = (id: string, name: string) => {
      let agent = agentMap.get(id);
      if (!agent) {
        agent = { id, name, totalMinutes: 0, workingDays: new Set(), absenceMinutes: 0 };
        agentMap.set(id, agent);
      }
      return agent;
    };

    attendances.forEach((att) => {
      if (!att.checkInTime) return;
      const agent = ensureAgent(att.userId, `${att.user.firstName} ${att.user.lastName}`.trim());
      agent.workingDays.add(att.date.toISOString().slice(0, 10));
      if (att.checkOutTime) {
        agent.totalMinutes += minutesBetween(new Date(att.checkInTime), new Date(att.checkOutTime));
      }
    });

    absences.forEach((abs) => {
      const agent = ensureAgent(abs.userId, `${abs.user.firstName} ${abs.user.lastName}`.trim());
      const from = abs.from > start ? abs.from : start;
      const to = abs.to < end ? abs.to : end;
      agent.absenceMinutes += minutesBetween(new Date(from), new Date(to));
    });

    const agentReports = Array.from(agentMap.values())
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        totalMinutes: Math.round(agent.totalMinutes),
        workingDays: agent.workingDays.size,
        absenceMinutes: Math.round(agent.absenceMinutes),
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    type SiteAgg = {
      id: string;
      name: string;
      totalMinutes: number;
      agents: Set<string>;
      days: Set<string>;
      coveredDays: Set<string>;
      startedCount: number;
      onTimeCount: number;
    };
    const siteMap = new Map<string, SiteAgg>();
    const ensureSite = (id: string, name: string) => {
      let site = siteMap.get(id);
      if (!site) {
        site = {
          id,
          name,
          totalMinutes: 0,
          agents: new Set(),
          days: new Set(),
          coveredDays: new Set(),
          startedCount: 0,
          onTimeCount: 0,
        };
        siteMap.set(id, site);
      }
      return site;
    };

    interventions.forEach((intervention) => {
      const site = ensureSite(intervention.siteId, intervention.site.name);
      site.days.add(intervention.date.toISOString().slice(0, 10));
    });

    attendances.forEach((att) => {
      if (!att.checkInTime) return;
      const site = ensureSite(att.intervention.siteId, att.intervention.site.name);
      site.agents.add(`${att.user.firstName} ${att.user.lastName}`.trim());
      site.coveredDays.add(att.date.toISOString().slice(0, 10));
      if (att.checkOutTime) {
        site.totalMinutes += minutesBetween(new Date(att.checkInTime), new Date(att.checkOutTime));
      }
      if (att.plannedStart) {
        site.startedCount += 1;
        const graceMs = toleranceMinutes * 60 * 1000;
        if (att.checkInTime.getTime() <= att.plannedStart.getTime() + graceMs) {
          site.onTimeCount += 1;
        }
      }
    });

    const siteReports = Array.from(siteMap.values())
      .map((site) => ({
        id: site.id,
        name: site.name,
        totalMinutes: Math.round(site.totalMinutes),
        agents: Array.from(site.agents),
        uncoveredDays: Array.from(site.days).filter((day) => !site.coveredDays.has(day)).length,
        punctualityRate: site.startedCount ? Math.round((site.onTimeCount / site.startedCount) * 1000) / 10 : null,
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    const totalMinutes = agentReports.reduce((sum, agent) => sum + agent.totalMinutes, 0);
    const totalAbsenceMinutes = agentReports.reduce((sum, agent) => sum + agent.absenceMinutes, 0);

    // Ponctualité : part des pointages démarrés dans la tolérance du planning
    const startedAttendances = attendances.filter((att) => att.checkInTime && att.plannedStart);
    const onTimeAttendances = startedAttendances.filter((att) => {
      const graceMs = toleranceMinutes * 60 * 1000;
      return att.checkInTime!.getTime() <= att.plannedStart!.getTime() + graceMs;
    });
    const punctualityRate = startedAttendances.length
      ? Math.round((onTimeAttendances.length / startedAttendances.length) * 1000) / 10
      : null;

    // Absentéisme : part du temps suivi (travaillé + absent) passée en absence
    const trackedMinutes = totalMinutes + totalAbsenceMinutes;
    const absenteeismRate = trackedMinutes ? Math.round((totalAbsenceMinutes / trackedMinutes) * 1000) / 10 : null;

    // Heures réalisées vs planifiées : durée des interventions × nombre d'agents assignés
    const plannedMinutes = interventions.reduce((sum, intervention) => {
      const durationMinutes = minutesBetween(
        this.combine(intervention.date.toISOString().slice(0, 10), intervention.startTime),
        this.combine(intervention.date.toISOString().slice(0, 10), intervention.endTime),
      );
      return sum + durationMinutes * intervention.assignments.length;
    }, 0);
    const realizationRate = plannedMinutes ? Math.round((totalMinutes / plannedMinutes) * 1000) / 10 : null;

    return {
      period,
      agentReports,
      siteReports,
      totals: { totalMinutes },
      kpis: {
        punctualityRate,
        absenteeismRate,
        plannedMinutes: Math.round(plannedMinutes),
        realizedMinutes: Math.round(totalMinutes),
        realizationRate,
      },
    };
  }

  /**
   * Quota d'heures mensuel par agent : heures planifiées (interventions assignées)
   * vs heures réalisées (pointages), avec pénalité si le taux d'accomplissement
   * passe sous le seuil configuré (settings.monthlyQuota).
   */
  /**
   * Restreint les sites accessibles à un superviseur (via SiteSupervisor). Retourne `null`
   * pour un ADMIN (aucune restriction). Lève une 403 si un siteId explicite hors périmètre
   * est demandé par un superviseur.
   */
  private async resolveSiteFilter(
    requesterRole: string | undefined,
    requesterId: string | undefined,
    explicitSiteId: string | undefined,
  ): Promise<string[] | null> {
    if (requesterRole !== 'SUPERVISOR') return null;
    const supervised = await this.prisma.siteSupervisor.findMany({
      where: { userId: requesterId },
      select: { siteId: true },
    });
    const allowedSiteIds = supervised.map((row) => row.siteId);
    if (explicitSiteId && !allowedSiteIds.includes(explicitSiteId)) {
      throw new ForbiddenException("Vous n'avez pas la charge de ce site");
    }
    return allowedSiteIds;
  }

  async hoursQuota(
    startDate: string | undefined,
    endDate: string | undefined,
    options: { siteId?: string; requesterId?: string; requesterRole?: string } = {},
  ) {
    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const period = {
      startDate: startDate ?? defaultStart,
      endDate: endDate ?? defaultEnd,
    };

    const start = this.startOfDay(this.parseDate(period.startDate, 'startDate'));
    const end = this.endOfDay(this.parseDate(period.endDate, 'endDate'));

    const allowedSiteIds = await this.resolveSiteFilter(options.requesterRole, options.requesterId, options.siteId);
    const siteFilter = options.siteId ? [options.siteId] : allowedSiteIds;

    const [interventions, attendances] = await Promise.all([
      this.prisma.intervention.findMany({
        where: {
          date: { gte: start, lte: end },
          ...(siteFilter ? { siteId: { in: siteFilter } } : {}),
        },
        include: { site: true, assignments: { include: { user: true } } },
      }),
      this.prisma.attendance.findMany({
        where: {
          date: { gte: start, lte: end },
          ...(siteFilter ? { intervention: { siteId: { in: siteFilter } } } : {}),
        },
        include: { user: true, intervention: { include: { site: true } } },
      }),
    ]);

    const minutesBetween = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / 60000);

    type AgentSiteAgg = {
      userId: string;
      name: string;
      siteId: string;
      siteName: string;
      plannedMinutes: number;
      realizedMinutes: number;
    };
    const key = (userId: string, siteId: string) => `${userId}::${siteId}`;
    const map = new Map<string, AgentSiteAgg>();
    const ensure = (userId: string, name: string, siteId: string, siteName: string) => {
      const k = key(userId, siteId);
      let entry = map.get(k);
      if (!entry) {
        entry = { userId, name, siteId, siteName, plannedMinutes: 0, realizedMinutes: 0 };
        map.set(k, entry);
      }
      return entry;
    };

    interventions.forEach((intervention) => {
      const dateStr = intervention.date.toISOString().slice(0, 10);
      const durationMinutes = minutesBetween(
        this.combine(dateStr, intervention.startTime),
        this.combine(dateStr, intervention.endTime),
      );
      intervention.assignments.forEach((assignment) => {
        const entry = ensure(
          assignment.userId,
          `${assignment.user.firstName} ${assignment.user.lastName}`.trim(),
          intervention.siteId,
          intervention.site.name,
        );
        entry.plannedMinutes += durationMinutes;
      });
    });

    attendances.forEach((att) => {
      if (!att.checkInTime || !att.checkOutTime) return;
      const entry = ensure(
        att.userId,
        `${att.user.firstName} ${att.user.lastName}`.trim(),
        att.intervention.siteId,
        att.intervention.site.name,
      );
      entry.realizedMinutes += minutesBetween(new Date(att.checkInTime), new Date(att.checkOutTime));
    });

    const threshold = this.settingsService.getSettings().monthlyQuota.accomplishmentThresholdPercent;

    const agentReports = Array.from(map.values())
      .map((entry) => {
        const plannedMinutes = Math.round(entry.plannedMinutes);
        const realizedMinutes = Math.round(entry.realizedMinutes);
        const accomplishmentRate = plannedMinutes > 0 ? Math.round((realizedMinutes / plannedMinutes) * 1000) / 10 : null;
        const meetsQuota = plannedMinutes === 0 || (accomplishmentRate ?? 0) >= threshold;
        const penaltyMinutes = meetsQuota ? 0 : Math.max(0, plannedMinutes - realizedMinutes);
        return {
          userId: entry.userId,
          name: entry.name,
          siteId: entry.siteId,
          siteName: entry.siteName,
          plannedMinutes,
          realizedMinutes,
          accomplishmentRate,
          meetsQuota,
          penaltyMinutes,
        };
      })
      .sort((a, b) => a.siteName.localeCompare(b.siteName) || a.name.localeCompare(b.name));

    const siteReportsMap = new Map<string, { siteId: string; siteName: string; agents: typeof agentReports }>();
    agentReports.forEach((agent) => {
      let site = siteReportsMap.get(agent.siteId);
      if (!site) {
        site = { siteId: agent.siteId, siteName: agent.siteName, agents: [] };
        siteReportsMap.set(agent.siteId, site);
      }
      site.agents.push(agent);
    });

    return {
      period,
      threshold,
      agentReports,
      siteReports: Array.from(siteReportsMap.values()),
    };
  }

  async hoursQuotaPdf(report: Awaited<ReturnType<ReportsService['hoursQuota']>>): Promise<Buffer> {
    const company = this.settingsService.getCompanyInfo();
    return this.documentPdfService.generateHoursQuotaReport(report, company);
  }

  /**
   * Dossier complet par site : combine performance() (heures, ponctualité, jours non
   * couverts), getSiteBenchmark() (complétion, anomalies), getBillingReport() (facturable/
   * interne) et hoursQuota() (quota/pénalité par agent) — sans dupliquer leurs calculs.
   */
  async siteDossier(
    startDate: string | undefined,
    endDate: string | undefined,
    options: { siteId?: string; requesterId?: string; requesterRole?: string } = {},
  ) {
    const allowedSiteIds = await this.resolveSiteFilter(options.requesterRole, options.requesterId, options.siteId);
    const targetSiteIds = options.siteId ? [options.siteId] : allowedSiteIds;

    const [performance, benchmark, billing, quota] = await Promise.all([
      this.performance(startDate, endDate),
      this.getSiteBenchmark(startDate, endDate),
      this.getBillingReport(startDate, endDate),
      this.hoursQuota(startDate, endDate, options),
    ]);

    const inScope = (siteId: string) => !targetSiteIds || targetSiteIds.includes(siteId);

    const benchmarkBySite = new Map(benchmark.map((row) => [row.siteId, row]));
    const billingBySite = new Map(billing.map((row) => [row.siteId, row]));
    const quotaBySite = new Map(quota.siteReports.map((row) => [row.siteId, row]));

    const sites = performance.siteReports
      .filter((site) => inScope(site.id))
      .map((site) => {
        const bm = benchmarkBySite.get(site.id);
        const bill = billingBySite.get(site.id);
        const q = quotaBySite.get(site.id);
        return {
          siteId: site.id,
          siteName: site.name,
          totalMinutes: site.totalMinutes,
          punctualityRate: site.punctualityRate,
          uncoveredDays: site.uncoveredDays,
          agentsInvolved: site.agents,
          interventionsTotal: bm?.interventionsTotal ?? 0,
          completionRate: bm?.completionRate ?? null,
          anomalyCount: bm?.anomalyCount ?? 0,
          billableHours: bill?.billableHours ?? 0,
          internalHours: bill?.internalHours ?? 0,
          quota: {
            threshold: quota.threshold,
            agents: q?.agents ?? [],
          },
        };
      })
      .sort((a, b) => a.siteName.localeCompare(b.siteName));

    return { period: performance.period, sites };
  }

  async siteDossierPdf(report: Awaited<ReturnType<ReportsService['siteDossier']>>): Promise<Buffer> {
    const company = this.settingsService.getCompanyInfo();
    return this.documentPdfService.generateSiteDossierReport(report, company);
  }

  async comparePeriods(startDate?: string, endDate?: string) {
    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const defaultStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const currentStart = startDate ?? defaultStart;
    const currentEnd = endDate ?? defaultEnd;
    const currentStartDate = this.parseDate(currentStart, 'startDate');
    const currentEndDate = this.parseDate(currentEnd, 'endDate');

    const durationMs = currentEndDate.getTime() - currentStartDate.getTime();
    const previousEnd = new Date(currentStartDate.getTime() - 24 * 60 * 60 * 1000);
    const previousStart = new Date(previousEnd.getTime() - durationMs);

    const [current, previous] = await Promise.all([
      this.performance(currentStart, currentEnd),
      this.performance(previousStart.toISOString().slice(0, 10), previousEnd.toISOString().slice(0, 10)),
    ]);

    const percentDelta = (curr: number | null, prev: number | null) => {
      if (curr == null || prev == null || prev === 0) return null;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    };

    return {
      current: { period: current.period, kpis: current.kpis, totals: current.totals },
      previous: { period: previous.period, kpis: previous.kpis, totals: previous.totals },
      deltas: {
        punctualityRate: percentDelta(current.kpis.punctualityRate, previous.kpis.punctualityRate),
        absenteeismRate: percentDelta(current.kpis.absenteeismRate, previous.kpis.absenteeismRate),
        realizationRate: percentDelta(current.kpis.realizationRate, previous.kpis.realizationRate),
        realizedMinutes: percentDelta(current.kpis.realizedMinutes, previous.kpis.realizedMinutes),
      },
    };
  }

  async getSiteBenchmark(startDate?: string, endDate?: string) {
    const sites = await this.prisma.site.findMany({ where: { active: true } });
    const defaultEnd = new Date().toISOString().slice(0, 10);
    const defaultStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const since = this.startOfDay(this.parseDate(startDate ?? defaultStart, 'startDate'));
    const until = this.endOfDay(this.parseDate(endDate ?? defaultEnd, 'endDate'));
    const results = await Promise.all(
      sites.map(async (site) => {
        const [interventions, anomalies] = await Promise.all([
          this.prisma.intervention.findMany({
            where: {
              siteId: site.id,
              date: { gte: since, lte: until },
              status: { in: ['COMPLETED', 'NEEDS_REVIEW', 'NO_SHOW'] },
            },
            select: { status: true },
          }),
          this.prisma.anomaly.count({
            where: { intervention: { siteId: site.id }, createdAt: { gte: since, lte: until } },
          }),
        ]);
        const total = interventions.length;
        const completed = interventions.filter((i) => i.status === 'COMPLETED').length;
        const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : null;
        return {
          siteId: site.id,
          siteName: site.name,
          interventionsTotal: total,
          completionRate,
          anomalyCount: anomalies,
        };
      }),
    );
    return results
      .filter((r) => r.interventionsTotal > 0)
      .sort((a, b) => (b.completionRate ?? 0) - (a.completionRate ?? 0));
  }

  async getBillingReport(startDate?: string, endDate?: string) {
    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const defaultStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const start = this.startOfDay(this.parseDate(startDate ?? defaultStart, 'startDate'));
    const end = this.endOfDay(this.parseDate(endDate ?? defaultEnd, 'endDate'));

    const attendances = await this.prisma.attendance.findMany({
      where: { date: { gte: start, lte: end }, checkInTime: { not: null }, checkOutTime: { not: null } },
      include: { intervention: { select: { billable: true, siteId: true, site: { select: { name: true } } } } },
    });

    type Agg = { siteName: string; billableMinutes: number; internalMinutes: number };
    const bySite = new Map<string, Agg>();
    attendances.forEach((att) => {
      const minutes = (att.checkOutTime!.getTime() - att.checkInTime!.getTime()) / 60000;
      const siteId = att.intervention.siteId;
      const existing = bySite.get(siteId) ?? { siteName: att.intervention.site.name, billableMinutes: 0, internalMinutes: 0 };
      if (att.intervention.billable) {
        existing.billableMinutes += minutes;
      } else {
        existing.internalMinutes += minutes;
      }
      bySite.set(siteId, existing);
    });

    const toHours = (m: number) => Math.round((m / 60) * 100) / 100;
    return Array.from(bySite.entries()).map(([siteId, agg]) => ({
      siteId,
      siteName: agg.siteName,
      billableHours: toHours(agg.billableMinutes),
      internalHours: toHours(agg.internalMinutes),
    }));
  }

  async getInvoicingReport() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [invoicesThisMonth, sentInvoices, quotesThisMonth] = await Promise.all([
      this.prisma.invoice.findMany({
        // Le CA facturé ne compte que les factures réellement émises au client : une facture
        // encore en brouillon n'a jamais été facturée, une facture annulée a été voidée.
        where: { issuedAt: { gte: monthStart }, status: { in: ['SENT', 'PAID'] } },
        include: { lineItems: true },
      }),
      this.prisma.invoice.findMany({
        where: { status: 'SENT' },
        include: { lineItems: true },
      }),
      this.prisma.quote.findMany({
        where: { issuedAt: { gte: monthStart } },
        select: { id: true, status: true },
      }),
    ]);

    const invoiceTotal = (inv: { lineItems: { quantity: number; unitPriceHT: number; vatRatePercent: number }[] }) =>
      computeTotals(inv.lineItems).totalTTC;

    const revenueThisMonth = invoicesThisMonth.reduce((sum, inv) => sum + invoiceTotal(inv), 0);

    let pendingAmount = 0;
    let overdueAmount = 0;
    for (const inv of sentInvoices) {
      const outstanding = invoiceTotal(inv) - inv.amountPaidHT;
      if (inv.dueAt && inv.dueAt < now) {
        overdueAmount += outstanding;
      } else {
        pendingAmount += outstanding;
      }
    }

    const decidedQuotes = quotesThisMonth.filter((q) => q.status === 'ACCEPTED' || q.status === 'REJECTED').length;
    const acceptedQuotes = quotesThisMonth.filter((q) => q.status === 'ACCEPTED').length;
    const conversionRate = decidedQuotes ? Math.round((acceptedQuotes / decidedQuotes) * 100) : null;

    const round2 = (v: number) => Math.round(v * 100) / 100;
    return {
      revenueThisMonth: round2(revenueThisMonth),
      pendingAmount: round2(pendingAmount),
      overdueAmount: round2(overdueAmount),
      conversionRate,
      quotesThisMonth: quotesThisMonth.length,
    };
  }

  async getDashboardLayout(userId: string) {
    const layout = await this.prisma.userDashboardLayout.findUnique({ where: { userId } });
    return layout?.layout ?? null;
  }

  async setDashboardLayout(userId: string, layout: unknown) {
    return this.prisma.userDashboardLayout.upsert({
      where: { userId },
      update: { layout: layout as any },
      create: { userId, layout: layout as any },
    });
  }

  private isoWeekKey(date: Date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  /**
   * Export paie : heures normales / majorées par agent et par semaine ISO,
   * seuil légal de 35h/semaine, en CSV.
   */
  async payrollCsv(startDate?: string, endDate?: string) {
    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const defaultStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const period = { startDate: startDate ?? defaultStart, endDate: endDate ?? defaultEnd };
    const start = this.startOfDay(this.parseDate(period.startDate, 'startDate'));
    const end = this.endOfDay(this.parseDate(period.endDate, 'endDate'));

    const attendances = await this.prisma.attendance.findMany({
      where: { date: { gte: start, lte: end }, checkInTime: { not: null }, checkOutTime: { not: null } },
      include: { user: true },
    });

    const LEGAL_WEEKLY_MINUTES = 35 * 60;
    type WeekAgg = { agentName: string; agentEmail: string; minutes: number };
    const byAgentWeek = new Map<string, WeekAgg>();

    attendances.forEach((att) => {
      if (!att.checkInTime || !att.checkOutTime) return;
      const minutes = Math.max(0, (att.checkOutTime.getTime() - att.checkInTime.getTime()) / 60000);
      const week = this.isoWeekKey(att.date);
      const key = `${att.userId}::${week}`;
      const existing = byAgentWeek.get(key);
      if (existing) {
        existing.minutes += minutes;
      } else {
        byAgentWeek.set(key, {
          agentName: `${att.user.firstName} ${att.user.lastName}`.trim(),
          agentEmail: att.user.email,
          minutes,
        });
      }
    });

    const rows = Array.from(byAgentWeek.entries())
      .map(([key, agg]) => {
        const [, week] = key.split('::');
        const normalMinutes = Math.min(agg.minutes, LEGAL_WEEKLY_MINUTES);
        const overtimeMinutes = Math.max(0, agg.minutes - LEGAL_WEEKLY_MINUTES);
        return {
          agentName: agg.agentName,
          agentEmail: agg.agentEmail,
          week,
          normalHours: Math.round((normalMinutes / 60) * 100) / 100,
          overtimeHours: Math.round((overtimeMinutes / 60) * 100) / 100,
          totalHours: Math.round((agg.minutes / 60) * 100) / 100,
        };
      })
      .sort((a, b) => a.agentName.localeCompare(b.agentName) || a.week.localeCompare(b.week));

    const header = 'Agent;Email;Semaine;Heures normales;Heures majorées;Total heures';
    const lines = rows.map(
      (r) =>
        `${r.agentName};${r.agentEmail};${r.week};${r.normalHours.toFixed(2)};${r.overtimeHours.toFixed(2)};${r.totalHours.toFixed(2)}`,
    );
    return [header, ...lines].join('\n');
  }

  private getFrenchPublicHolidays(year: number): Set<string> {
    return frenchPublicHolidays(year);
  }

  /**
   * Ventilation fine des heures : normal / nuit (22h-6h) / dimanche / jour férié.
   * Un jour férié ou dimanche majore l'intégralité de la vacation (pas de cumul avec la nuit).
   */
  async payrollBreakdown(startDate?: string, endDate?: string) {
    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const defaultStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const period = { startDate: startDate ?? defaultStart, endDate: endDate ?? defaultEnd };
    const start = this.startOfDay(this.parseDate(period.startDate, 'startDate'));
    const end = this.endOfDay(this.parseDate(period.endDate, 'endDate'));

    const attendances = await this.prisma.attendance.findMany({
      where: { date: { gte: start, lte: end }, checkInTime: { not: null }, checkOutTime: { not: null } },
      include: { user: true },
    });

    const holidaysByYear = new Map<number, Set<string>>();
    const getHolidays = (year: number) => {
      if (!holidaysByYear.has(year)) {
        holidaysByYear.set(year, this.getFrenchPublicHolidays(year));
      }
      return holidaysByYear.get(year)!;
    };

    type Agg = {
      agentName: string;
      agentEmail: string;
      normalMinutes: number;
      nightMinutes: number;
      sundayMinutes: number;
      holidayMinutes: number;
    };
    const byAgent = new Map<string, Agg>();

    // Nuit = 22h–6h à l'heure de Paris (changements d'heure compris).
    const nightOverlapMinutes = (checkIn: Date, checkOut: Date) => {
      let minutes = 0;
      const firstDay = new Date(checkIn.getTime() - 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
      let cursor = new Date(`${firstDay}T00:00:00Z`);
      while (cursor.getTime() < checkOut.getTime() + 86_400_000) {
        const day = cursor.toISOString().slice(0, 10);
        const next = new Date(cursor.getTime() + 86_400_000).toISOString().slice(0, 10);
        const nightStart = parisDateTime(day, '22:00');
        const nightEnd = parisDateTime(next, '06:00');
        const overlapStart = Math.max(checkIn.getTime(), nightStart.getTime());
        const overlapEnd = Math.min(checkOut.getTime(), nightEnd.getTime());
        if (overlapEnd > overlapStart) minutes += (overlapEnd - overlapStart) / 60000;
        cursor = new Date(cursor.getTime() + 86_400_000);
      }
      return minutes;
    };
    const weekOf = (date: Date) => {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    };
    const weekly = new Map<string, Map<string, number>>();

    attendances.forEach((att) => {
      if (!att.checkInTime || !att.checkOutTime) return;
      const dateKey = att.date.toISOString().slice(0, 10);
      const year = att.date.getUTCFullYear();
      const totalMinutes = Math.max(0, (att.checkOutTime.getTime() - att.checkInTime.getTime()) / 60000);
      const key = att.userId;
      const existing = byAgent.get(key) ?? {
        agentName: `${att.user.firstName} ${att.user.lastName}`.trim(),
        agentEmail: att.user.email,
        normalMinutes: 0,
        nightMinutes: 0,
        sundayMinutes: 0,
        holidayMinutes: 0,
      };

      const weeks = weekly.get(key) ?? new Map<string, number>();
      weeks.set(weekOf(att.date), (weeks.get(weekOf(att.date)) ?? 0) + totalMinutes);
      weekly.set(key, weeks);
      if (getHolidays(year).has(dateKey)) {
        existing.holidayMinutes += totalMinutes;
      } else if (att.date.getUTCDay() === 0) {
        existing.sundayMinutes += totalMinutes;
      } else {
        const night = Math.min(totalMinutes, nightOverlapMinutes(att.checkInTime, att.checkOutTime));
        existing.nightMinutes += night;
        existing.normalMinutes += totalMinutes - night;
      }
      byAgent.set(key, existing);
    });

    const toHours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
    const LEGAL_WEEKLY_MINUTES = 35 * 60;
    return Array.from(byAgent.entries())
      .map(([userId, agg]) => {
        const overtime = Array.from(weekly.get(userId)?.values() ?? []).reduce((n, m) => n + Math.max(0, m - LEGAL_WEEKLY_MINUTES), 0);
        return {
          agentName: agg.agentName,
          agentEmail: agg.agentEmail,
          normalHours: toHours(agg.normalMinutes),
          nightHours: toHours(agg.nightMinutes),
          sundayHours: toHours(agg.sundayMinutes),
          holidayHours: toHours(agg.holidayMinutes),
          totalHours: toHours(agg.normalMinutes + agg.nightMinutes + agg.sundayMinutes + agg.holidayMinutes),
          /** Heures au-delà de 35 h par semaine (comprises dans le total). */
          overtimeHours: toHours(overtime),
        };
      })
      .sort((a, b) => a.agentName.localeCompare(b.agentName));
  }

  /** Préparation de paie au format tableur (séparateur « ; », lisible par Excel). */
  async payrollBreakdownCsv(startDate?: string, endDate?: string) {
    const rows = await this.payrollBreakdown(startDate, endDate);
    const fmt = (n: number) => n.toFixed(2).replace('.', ',');
    const header = 'Agent;E-mail;Heures normales;Heures de nuit (22h-6h);Heures du dimanche;Heures fériées;Total;Dont heures au-delà de 35 h/semaine';
    const lines = rows.map((r) =>
      [r.agentName, r.agentEmail, fmt(r.normalHours), fmt(r.nightHours), fmt(r.sundayHours), fmt(r.holidayHours), fmt(r.totalHours), fmt(r.overtimeHours)].join(';'),
    );
    return '\uFEFF' + [header, ...lines].join('\n');
  }

  async pushPayrollToPayrollProvider(startDate?: string, endDate?: string) {
    const breakdown = await this.payrollBreakdown(startDate, endDate);
    await this.webhooksService.dispatch('payroll.export', {
      period: { startDate, endDate },
      rows: breakdown,
    });
    return { dispatched: true, agentCount: breakdown.length };
  }
}
