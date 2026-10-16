import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ClientReportData, generateClientReportPdf } from '../documents/client-report-pdf';

const STATUS: Record<string, string> = {
  PLANNED: 'Prévu',
  IN_PROGRESS: 'En cours',
  NEEDS_REVIEW: 'Réalisé',
  COMPLETED: 'Réalisé',
  CANCELLED: 'Annulé',
  NO_SHOW: 'Non réalisé',
};
const RATING: Record<string, string> = { AVERAGE: 'Moyen', POOR: 'À reprendre' };
const clock = (d?: Date | null) =>
  d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : '—';
const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

/** Compte rendu mensuel destiné au client d'un site (téléchargé, jamais envoyé automatiquement). */
@Injectable()
export class ClientReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async build(siteId: string, month: string): Promise<ClientReportData> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')) throw new BadRequestException('Mois attendu au format AAAA-MM');
    const site = await this.prisma.site.findUnique({ where: { id: siteId }, select: { name: true, address: true } });
    if (!site) throw new NotFoundException('Site introuvable');
    const [year, m] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, m - 1, 1));
    const end = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
    const today = new Date();

    const [missions, inspections] = await Promise.all([
      this.prisma.intervention.findMany({
        where: { siteId, date: { gte: start, lte: end } },
        include: {
          assignments: { include: { user: { select: { firstName: true, lastName: true } } } },
          attendances: true,
          checklistItems: { select: { done: true } },
          anomalies: { select: { title: true, type: true, status: true, createdAt: true } },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.qualityInspection.findMany({ where: { siteId, createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'asc' } }),
    ]);

    let done = 0;
    let missed = 0;
    let cancelled = 0;
    let workedMinutes = 0;
    let checklistDone = 0;
    let checklistTotal = 0;
    const photoSources: string[] = [];
    const visits = missions.map((mission) => {
      const isDone = mission.status === 'COMPLETED' || mission.status === 'NEEDS_REVIEW';
      const isPast = mission.date.getTime() < today.getTime() - 86_400_000;
      if (isDone) done += 1;
      else if (mission.status === 'CANCELLED') cancelled += 1;
      else if (mission.status === 'NO_SHOW' || isPast) missed += 1;
      const starts = mission.attendances.map((a) => a.checkInTime ?? a.arrivalTime).filter((d): d is Date => !!d);
      const ends = mission.attendances.map((a) => a.checkOutTime).filter((d): d is Date => !!d);
      for (const a of mission.attendances) {
        const s = a.checkInTime ?? a.arrivalTime;
        if (s && a.checkOutTime) workedMinutes += Math.max(0, (a.checkOutTime.getTime() - s.getTime()) / 60_000);
        if (a.checkOutPhoto) photoSources.push(a.checkOutPhoto);
      }
      photoSources.push(...mission.photos);
      const total = mission.checklistItems.length;
      const ok = mission.checklistItems.filter((c) => c.done).length;
      if (isDone) {
        checklistTotal += total;
        checklistDone += ok;
      }
      const first = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
      const last = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
      const status = mission.status === 'PLANNED' && isPast ? 'Non réalisé' : STATUS[mission.status] ?? mission.status;
      return {
        date: mission.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }),
        slot: `${mission.startTime}–${mission.endTime}`,
        actual: first ? `${clock(first)}–${clock(last)}` : '—',
        agents: mission.assignments.map((a) => fullName(a.user)).join(', ') || '—',
        status,
        checklist: total ? `${ok}/${total}` : '—',
      };
    });

    // Photos : les plus récentes, au format image intégré (au plus 6).
    const photos = photoSources
      .filter((src) => /^data:image\/(png|jpe?g);base64,/.test(src))
      .slice(-6)
      .map((src) => Buffer.from(src.split(',')[1], 'base64'));

    const monthLabel = start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return {
      site: { name: site.name, address: site.address },
      monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
      totals: {
        planned: missions.length,
        done,
        missed,
        cancelled,
        hours: Math.round(workedMinutes / 6) / 10,
        checklistRate: checklistTotal ? Math.round((checklistDone / checklistTotal) * 100) : null,
      },
      visits,
      anomalies: missions.flatMap((mission) =>
        mission.anomalies.map((a) => ({
          date: a.createdAt.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }),
          title: a.title ?? a.type,
          status: a.status === 'NEW' ? 'en cours de traitement' : 'traité',
        })),
      ),
      inspections: inspections.map((q) => ({
        date: q.createdAt.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }),
        score: q.score,
        remarks: [
          ...((q.items as Array<{ label: string; rating: string; comment?: string }>) ?? [])
            .filter((i) => i.rating !== 'GOOD')
            .map((i) => `${RATING[i.rating] ?? i.rating} : ${i.label}${i.comment ? ` (${i.comment})` : ''}`),
          q.comment ?? '',
        ]
          .filter(Boolean)
          .join(' · '),
      })),
      photos,
    };
  }

  async pdf(siteId: string, month: string) {
    const data = await this.build(siteId, month);
    const buffer = await generateClientReportPdf(data, this.settings.getCompanyInfo());
    const slug = data.site.name.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    return { buffer, filename: `compte-rendu-${slug}-${month}.pdf` };
  }
}
