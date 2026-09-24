import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DocumentNumberingService } from '../documents/document-numbering.service';
import { computeTotals } from '../documents/line-items.util';
import { DocumentPdfService } from '../documents/document-pdf.service';
import { SettingsService } from '../settings/settings.service';
import { MailerService } from '../notifications/mailer.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { RecordInvoicePaymentDto } from './dto/record-invoice-payment.dto';

const INCLUDE = { site: { select: { name: true } }, lineItems: { orderBy: { order: 'asc' as const } } };
const OVERDUE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// PAID n'est volontairement pas atteignable depuis ce endpoint générique : seul `recordPayment`
// (qui calcule réellement le solde) peut faire passer une facture à PAID. PAID est un état terminal :
// l'app n'a aucun mécanisme d'avoir/remboursement, donc annuler une facture déjà soldée laisserait un
// paiement réellement encaissé associé à un document "annulé" — plus risqué comptablement que
// d'interdire la transition. Une correction doit passer par un vrai avoir (hors périmètre actuel).
const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['CANCELLED'],
  PAID: [],
  CANCELLED: [],
};

@Injectable()
export class InvoicesService implements OnModuleInit {
  private readonly logger = new Logger(InvoicesService.name);
  private readonly overdueNotified = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberingService,
    private readonly pdf: DocumentPdfService,
    private readonly settings: SettingsService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    setInterval(() => {
      this.checkOverdueInvoices().catch((err) => this.logger.warn('Vérification factures en retard échouée', err));
    }, OVERDUE_CHECK_INTERVAL_MS);
  }

  /**
   * Relance les admins pour les factures envoyées dont l'échéance est dépassée.
   * OVERDUE n'est pas un statut stocké : dérivé de SENT + dueAt < now (voir present()),
   * pour rester toujours cohérent même si dueAt est modifié après l'envoi.
   */
  private async checkOverdueInvoices() {
    const overdue = await this.prisma.invoice.findMany({
      where: { status: 'SENT', dueAt: { lt: new Date() } },
      select: { id: true, number: true, clientName: true, dueAt: true },
    });
    if (!overdue.length) return;

    const admins = this.usersService.findAll({ role: 'admin', pageSize: 500 }).items;
    for (const invoice of overdue) {
      if (this.overdueNotified.has(invoice.id)) continue;
      this.overdueNotified.add(invoice.id);
      for (const admin of admins) {
        try {
          await this.notifications.send({
            audience: 'AGENT',
            targetId: admin.id,
            title: 'Facture en retard de paiement',
            message: `${invoice.number} — ${invoice.clientName} (échéance dépassée).`,
          } as any);
        } catch (err: any) {
          this.logger.warn(`Relance facture en retard échouée (${invoice.id} -> ${admin.id}): ${err?.message || err}`);
        }
      }
    }

    const stillOverdueIds = new Set(overdue.map((i) => i.id));
    for (const key of Array.from(this.overdueNotified)) {
      if (!stillOverdueIds.has(key)) {
        this.overdueNotified.delete(key);
      }
    }
  }

  private present(invoice: any) {
    const totals = computeTotals(invoice.lineItems ?? []);
    const isOverdue = invoice.status === 'SENT' && invoice.dueAt && new Date(invoice.dueAt) < new Date();
    return { ...invoice, ...totals, isOverdue: Boolean(isOverdue) };
  }

  async findAll(siteId?: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: siteId ? { siteId } : undefined,
      orderBy: { issuedAt: 'desc' },
      include: INCLUDE,
    });
    return invoices.map((i) => this.present(i));
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: INCLUDE });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable');
    }
    return this.present(invoice);
  }

  async create(dto: CreateInvoiceDto, actorId: string) {
    if (!dto.lineItems.length) {
      throw new BadRequestException('Au moins une ligne est requise');
    }
    const number = await this.numbering.next('INVOICE');
    const invoice = await this.prisma.invoice.create({
      data: {
        number,
        siteId: dto.siteId,
        quoteId: dto.quoteId,
        label: dto.label,
        clientName: dto.clientName,
        clientAddress: dto.clientAddress,
        clientEmail: dto.clientEmail,
        notes: dto.notes,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        lineItems: {
          create: dto.lineItems.map((item, index) => ({
            description: item.description,
            quantity: item.quantity,
            unitPriceHT: item.unitPriceHT,
            vatRatePercent: item.vatRatePercent ?? 20,
            order: index,
          })),
        },
      },
      include: INCLUDE,
    });
    this.audit.record({ actorId, action: 'CREATE_INVOICE', entityType: 'invoice', entityId: invoice.id, details: invoice.number });
    return this.present(invoice);
  }

  private async ensureEditable(id: string) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Facture introuvable');
    }
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Seule une facture en brouillon peut être modifiée');
    }
    return existing;
  }

  async update(id: string, dto: UpdateInvoiceDto, actorId: string) {
    await this.ensureEditable(id);
    if (dto.lineItems && !dto.lineItems.length) {
      throw new BadRequestException('Au moins une ligne est requise');
    }
    const invoice = await this.prisma.$transaction(async (tx) => {
      if (dto.lineItems) {
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
      }
      return tx.invoice.update({
        where: { id },
        data: {
          label: dto.label,
          clientName: dto.clientName,
          clientAddress: dto.clientAddress,
          clientEmail: dto.clientEmail,
          notes: dto.notes,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
          lineItems: dto.lineItems
            ? {
                create: dto.lineItems.map((item, index) => ({
                  description: item.description,
                  quantity: item.quantity,
                  unitPriceHT: item.unitPriceHT,
                  vatRatePercent: item.vatRatePercent ?? 20,
                  order: index,
                })),
              }
            : undefined,
        },
        include: INCLUDE,
      });
    });
    this.audit.record({ actorId, action: 'UPDATE_INVOICE', entityType: 'invoice', entityId: invoice.id });
    return this.present(invoice);
  }

  async setStatus(id: string, status: InvoiceStatus, actorId: string) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Facture introuvable');
    }
    if (existing.status !== status && !INVOICE_TRANSITIONS[existing.status].includes(status)) {
      throw new BadRequestException(
        `Transition de statut invalide : ${existing.status} → ${status}`,
      );
    }
    const invoice = await this.prisma.invoice.update({ where: { id }, data: { status }, include: INCLUDE });
    this.audit.record({ actorId, action: 'UPDATE_INVOICE', entityType: 'invoice', entityId: invoice.id, details: `status:${status}` });
    return this.present(invoice);
  }

  async remove(id: string, actorId: string) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Facture introuvable');
    }
    await this.prisma.invoice.delete({ where: { id } });
    this.audit.record({ actorId, action: 'DELETE_INVOICE', entityType: 'invoice', entityId: id, details: existing.number });
    return { deleted: true };
  }

  async buildPdf(id: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: INCLUDE });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable');
    }
    const company = this.settings.getCompanyInfo();
    return this.pdf.generate(
      {
        kind: 'FACTURE',
        number: invoice.number,
        label: invoice.label,
        clientName: invoice.clientName,
        clientAddress: invoice.clientAddress,
        clientEmail: invoice.clientEmail,
        issuedAt: invoice.issuedAt,
        dueAt: invoice.dueAt,
        notes: invoice.notes,
        lineItems: invoice.lineItems,
        paymentInfo: invoice.paidAt ? { paidAt: invoice.paidAt, paymentMethod: invoice.paymentMethod } : null,
      },
      company,
    );
  }

  async send(id: string, actorId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable');
    }
    if (!invoice.clientEmail) {
      throw new BadRequestException("Aucun email client n'est renseigné sur cette facture");
    }
    const pdfBuffer = await this.buildPdf(id);
    await this.mailer.send(
      invoice.clientEmail,
      `Facture ${invoice.number} — ${invoice.label}`,
      `<p>Bonjour,</p><p>Veuillez trouver ci-joint votre facture ${invoice.number}.</p>`,
      {
        filename: `${invoice.number}.pdf`,
        content: pdfBuffer.toString('base64'),
        type: 'application/pdf',
        encoding: 'base64',
      },
    );
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: invoice.status === 'DRAFT' ? 'SENT' : invoice.status },
      include: INCLUDE,
    });
    this.audit.record({ actorId, action: 'SEND_INVOICE', entityType: 'invoice', entityId: id, details: invoice.clientEmail });
    return this.present(updated);
  }

  async recordPayment(id: string, dto: RecordInvoicePaymentDto, actorId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: { lineItems: true } });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable');
    }
    if (invoice.status === 'DRAFT' || invoice.status === 'CANCELLED') {
      throw new BadRequestException(
        `Impossible d'enregistrer un paiement sur une facture ${invoice.status === 'DRAFT' ? 'en brouillon' : 'annulée'}`,
      );
    }
    const totals = computeTotals(invoice.lineItems);
    const isFullyPaid = dto.amountPaidHT >= totals.totalTTC;
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        amountPaidHT: dto.amountPaidHT,
        paymentMethod: dto.paymentMethod,
        paidAt: isFullyPaid ? new Date(dto.paidAt ?? Date.now()) : null,
        // Un montant qui ne solde plus la facture repasse toujours par SENT — jamais de statut PAID
        // fantôme si le montant réellement enregistré est repassé sous le total dû.
        status: isFullyPaid ? 'PAID' : 'SENT',
      },
      include: INCLUDE,
    });
    this.audit.record({
      actorId,
      action: 'RECORD_INVOICE_PAYMENT',
      entityType: 'invoice',
      entityId: id,
      details: `${dto.amountPaidHT}€${isFullyPaid ? ' (soldée)' : ' (partiel)'}`,
    });
    return this.present(updated);
  }
}
