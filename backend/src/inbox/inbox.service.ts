import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { parisToday } from '../common/utils/paris-time';

export type InboxUrgency = 'HIGH' | 'MEDIUM' | 'LOW';
export type InboxItem = {
  id: string;
  kind: 'APPROVAL' | 'ABSENCE' | 'ANOMALY' | 'MISSION_TO_VALIDATE' | 'LOW_STOCK' | 'INVOICE_OVERDUE' | 'CERTIFICATION';
  urgency: InboxUrgency;
  title: string;
  detail: string;
  date: string;
  /** Page du site web où traiter l'élément. */
  link: string;
};

const DAY = 86_400_000;
const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();
const fr = (d: Date) => d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
const ACTION_TITLES: Record<string, string> = {
  VALIDATE_TEMPLATE: 'Gabarit à valider',
  CANCEL_OCCURRENCE: 'Annulation d’un passage',
  CANCEL_INTERVENTION: 'Annulation de mission',
  CREATE_TEMPLATE_BATCH: 'Génération de missions',
};

/**
 * File unique « à traiter » de l'administrateur : tout ce qui attend une décision ou une action,
 * trié par urgence puis par ancienneté.
 */
@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalsService,
  ) {}

  async list(now: Date = new Date()) {
    const today = parisToday(now);
    const in30 = new Date(now.getTime() + 30 * DAY);
    const [approvals, absences, anomalies, missions, stock, invoices, certifications] = await Promise.all([
      this.approvals.list({ status: 'PENDING', pageSize: 100 }),
      this.prisma.absence.findMany({
        where: { status: 'PENDING' },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { from: 'asc' },
        take: 100,
      }),
      this.prisma.anomaly.findMany({
        where: { status: 'NEW' },
        include: { intervention: { select: { site: { select: { name: true } }, date: true } }, user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.intervention.findMany({
        where: { status: 'NEEDS_REVIEW', date: { lt: new Date(`${today}T00:00:00.000Z`) } },
        include: { site: { select: { name: true } } },
        orderBy: { date: 'asc' },
        take: 100,
      }),
      this.prisma.inventoryItem.findMany({ include: { site: { select: { name: true } } } }),
      this.prisma.invoice.findMany({ where: { status: 'SENT', dueAt: { lt: now } }, orderBy: { dueAt: 'asc' } }),
      this.prisma.certification.findMany({
        where: { expiresAt: { not: null, lte: in30 } },
        include: { user: { select: { firstName: true, lastName: true, active: true } } },
        orderBy: { expiresAt: 'asc' },
      }),
    ]);

    const items: InboxItem[] = [];
    for (const r of approvals.items) {
      items.push({
        id: `approval:${r.id}`,
        kind: 'APPROVAL',
        urgency: r.actionType === 'CANCEL_OCCURRENCE' || r.actionType === 'CANCEL_INTERVENTION' ? 'HIGH' : 'MEDIUM',
        title: ACTION_TITLES[r.actionType] ?? 'Demande à valider',
        detail: `${r.summary ?? ''}${r.requestedByName ? ` · demandé par ${r.requestedByName}` : ''}`.replace(/^ · /, ''),
        date: r.createdAt.toISOString(),
        link: '/approvals',
      });
    }
    for (const a of absences) {
      const awaitingAdmin = a.requiresSecondApproval && !!a.level1ApprovedBy;
      const past = a.to.getTime() < now.getTime() - DAY;
      const startsSoon = !past && a.from.getTime() - now.getTime() < 3 * DAY;
      items.push({
        id: `absence:${a.id}`,
        kind: 'ABSENCE',
        urgency: startsSoon ? 'HIGH' : awaitingAdmin ? 'MEDIUM' : 'LOW',
        title: past ? 'Absence passée jamais traitée' : awaitingAdmin ? 'Absence longue : accord final' : 'Absence en attente',
        detail: `${fullName(a.user)} · du ${fr(a.from)} au ${fr(a.to)}`,
        date: a.createdAt.toISOString(),
        link: `/absences/${a.id}`,
      });
    }
    for (const an of anomalies) {
      items.push({
        id: `anomaly:${an.id}`,
        kind: 'ANOMALY',
        urgency: now.getTime() - an.createdAt.getTime() > 2 * DAY ? 'HIGH' : 'MEDIUM',
        title: `Anomalie : ${an.title ?? an.type}`,
        detail: `${an.intervention.site.name} · signalée par ${fullName(an.user)}`,
        date: an.createdAt.toISOString(),
        link: '/interventions',
      });
    }
    for (const m of missions) {
      items.push({
        id: `mission:${m.id}`,
        kind: 'MISSION_TO_VALIDATE',
        urgency: now.getTime() - m.date.getTime() > 3 * DAY ? 'MEDIUM' : 'LOW',
        title: 'Mission pas encore validée',
        detail: `${m.site.name} · ${fr(m.date)} ${m.startTime}–${m.endTime}`,
        date: m.date.toISOString(),
        link: '/interventions',
      });
    }
    for (const s of stock.filter((i) => i.quantity <= i.minThreshold)) {
      items.push({
        id: `stock:${s.id}`,
        kind: 'LOW_STOCK',
        urgency: s.quantity === 0 ? 'HIGH' : 'LOW',
        title: `Stock bas : ${s.name}`,
        detail: `${s.site.name} · reste ${s.quantity} ${s.unit} (seuil ${s.minThreshold})`,
        date: s.updatedAt.toISOString(),
        link: '/sites',
      });
    }
    for (const inv of invoices) {
      items.push({
        id: `invoice:${inv.id}`,
        kind: 'INVOICE_OVERDUE',
        urgency: 'MEDIUM',
        title: `Facture en retard de paiement : ${inv.number}`,
        detail: `${inv.clientName} · échéance ${fr(inv.dueAt!)}`,
        date: inv.dueAt!.toISOString(),
        link: '/factures',
      });
    }
    for (const c of certifications.filter((c) => c.user.active)) {
      const expired = c.expiresAt!.getTime() < now.getTime();
      items.push({
        id: `certification:${c.id}`,
        kind: 'CERTIFICATION',
        urgency: expired ? 'MEDIUM' : 'LOW',
        title: expired ? `Habilitation expirée : ${c.label}` : `Habilitation à renouveler : ${c.label}`,
        detail: `${fullName(c.user)} · ${expired ? 'expirée le' : 'expire le'} ${fr(c.expiresAt!)}`,
        date: c.expiresAt!.toISOString(),
        link: '/users',
      });
    }

    const rank: Record<InboxUrgency, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    items.sort((a, b) => rank[a.urgency] - rank[b.urgency] || a.date.localeCompare(b.date));
    const counts = items.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.kind]: (acc[i.kind] ?? 0) + 1 }), {});
    return { total: items.length, high: items.filter((i) => i.urgency === 'HIGH').length, counts, items };
  }
}
