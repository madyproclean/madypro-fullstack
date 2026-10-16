import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PlatformService } from '../platform/platform.service';
import { SitesService } from '../sites/sites.service';
import { buildIcs } from '../common/utils/ics';
import { ClientReportService } from '../reports/client-report.service';
import { InterventionsService } from '../interventions/interventions.service';

@Injectable()
export class PublicApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformService: PlatformService,
    private readonly sitesService: SitesService,
    private readonly clientReports: ClientReportService,
    private readonly interventions: InterventionsService,
  ) {}

  async listSites() {
    return this.prisma.site.findMany({
      where: { active: true },
      select: { id: true, name: true, address: true, latitude: true, longitude: true },
    });
  }

  async listInterventions(startDate?: string, endDate?: string, siteId?: string) {
    const start = startDate ? new Date(`${startDate}T00:00:00.000Z`) : new Date();
    const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    return this.prisma.intervention.findMany({
      where: { date: { gte: start, lte: end }, ...(siteId ? { siteId } : {}) },
      select: { id: true, siteId: true, date: true, startTime: true, endTime: true, status: true, type: true },
      orderBy: { date: 'asc' },
    });
  }

  async getCalendarFeed(siteId: string) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site introuvable');
    }
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const interventions = await this.prisma.intervention.findMany({
      where: { siteId, date: { gte: from, lte: to }, status: { not: 'CANCELLED' } },
      orderBy: { date: 'asc' },
    });
    return buildIcs(site.name, interventions);
  }

  /**
   * Espace client en lecture seule (lien personnel par site) : passages récents avec horaires réels,
   * passages à venir, contrôles qualité et comptes rendus mensuels. Aucune donnée personnelle des
   * agents au-delà du prénom.
   */
  async getPortalSummary(token: string) {
    const portalToken = await this.platformService.resolvePortalToken(token);
    const siteId = portalToken.siteId;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
    const in14 = new Date(new Date(`${today}T00:00:00Z`).getTime() + 13 * 86_400_000).toISOString().slice(0, 10);
    const [site, qualityScore, recent, upcoming, inspections] = await Promise.all([
      this.prisma.site.findUnique({ where: { id: siteId } }),
      this.sitesService.getQualityScore(siteId),
      this.prisma.intervention.findMany({
        where: { siteId, date: { gte: new Date(Date.now() - 60 * 86_400_000), lte: new Date(`${today}T23:59:59Z`) } },
        orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
        take: 30,
        include: {
          assignments: { include: { user: { select: { firstName: true } } } },
          attendances: { select: { checkInTime: true, arrivalTime: true, checkOutTime: true } },
          category: { select: { label: true } },
        },
      }),
      this.interventions.getPlanning({ startDate: today, endDate: in14, siteId }),
      this.prisma.qualityInspection.findMany({ where: { siteId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);
    const clock = (d?: Date | null) =>
      d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : null;
    const months: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - i);
      months.push(d.toISOString().slice(0, 7));
    }
    return {
      site: { id: site!.id, name: site!.name, address: site!.address },
      qualityScore,
      recentInterventions: recent.map((i) => {
        const starts = i.attendances.map((a) => a.checkInTime ?? a.arrivalTime).filter((d): d is Date => !!d);
        const ends = i.attendances.map((a) => a.checkOutTime).filter((d): d is Date => !!d);
        return {
          id: i.id,
          date: i.date,
          startTime: i.startTime,
          endTime: i.endTime,
          status: i.status,
          type: i.type,
          prestation: i.category?.label ?? null,
          agents: i.assignments.map((a) => a.user.firstName),
          arrivedAt: starts.length ? clock(new Date(Math.min(...starts.map((d) => d.getTime())))) : null,
          leftAt: ends.length ? clock(new Date(Math.max(...ends.map((d) => d.getTime())))) : null,
        };
      }),
      upcoming: upcoming
        .filter((o) => o.source === 'projected' || o.status === 'PLANNED')
        .map((o) => ({ date: o.date, startTime: o.startTime, endTime: o.endTime, prestation: o.categoryLabel ?? null })),
      inspections: inspections.map((q) => ({ date: q.createdAt, score: q.score })),
      reportMonths: months,
    };
  }

  async getPortalReport(token: string, month: string) {
    const portalToken = await this.platformService.resolvePortalToken(token);
    return this.clientReports.pdf(portalToken.siteId, month);
  }

  async getPortalIncidents(token: string) {
    const portalToken = await this.platformService.resolvePortalToken(token);
    return this.sitesService.getIncidentTimeline(portalToken.siteId);
  }
}
