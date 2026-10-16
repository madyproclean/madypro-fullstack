import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { QuoteStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DocumentNumberingService } from '../documents/document-numbering.service';
import { computeTotals } from '../documents/line-items.util';
import { DocumentPdfService } from '../documents/document-pdf.service';
import { SettingsService } from '../settings/settings.service';
import { MailerService } from '../notifications/mailer.service';
import { AuditService } from '../audit/audit.service';
import { InvoicesService } from '../invoices/invoices.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';

const INCLUDE = { site: { select: { name: true } }, lineItems: { orderBy: { order: 'asc' as const } } };

// Transitions autorisées : DRAFT est le seul état modifiable en lignes ; ACCEPTED/REJECTED sont des
// décisions du client et n'ont pas vocation à être annulées après coup autrement qu'en CANCELLED.
const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['CANCELLED'],
  REJECTED: ['CANCELLED'],
  CANCELLED: [],
};

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberingService,
    private readonly pdf: DocumentPdfService,
    private readonly settings: SettingsService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly invoices: InvoicesService,
  ) {}

  private present(quote: any) {
    const totals = computeTotals(quote.lineItems ?? []);
    return { ...quote, ...totals };
  }

  async findAll(siteId?: string) {
    const quotes = await this.prisma.quote.findMany({
      where: siteId ? { siteId } : undefined,
      orderBy: { issuedAt: 'desc' },
      include: INCLUDE,
    });
    return quotes.map((q) => this.present(q));
  }

  async findOne(id: string) {
    const quote = await this.prisma.quote.findUnique({ where: { id }, include: INCLUDE });
    if (!quote) {
      throw new NotFoundException('Devis introuvable');
    }
    return this.present(quote);
  }

  async create(dto: CreateQuoteDto, actorId: string) {
    if (!dto.lineItems.length) {
      throw new BadRequestException('Au moins une ligne est requise');
    }
    const number = await this.numbering.next('QUOTE');
    const quote = await this.prisma.quote.create({
      data: {
        number,
        siteId: dto.siteId,
        interventionId: dto.interventionId,
        label: dto.label,
        clientName: dto.clientName,
        clientAddress: dto.clientAddress,
        clientEmail: dto.clientEmail,
        notes: dto.notes,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        documentUrl: dto.documentUrl,
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
    this.audit.record({ actorId, action: 'CREATE_QUOTE', entityType: 'quote', entityId: quote.id, details: quote.number });
    return this.present(quote);
  }

  private async ensureEditable(id: string) {
    const existing = await this.prisma.quote.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Devis introuvable');
    }
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Seul un devis en brouillon peut être modifié');
    }
    return existing;
  }

  async update(id: string, dto: UpdateQuoteDto, actorId: string) {
    await this.ensureEditable(id);
    if (dto.lineItems && !dto.lineItems.length) {
      throw new BadRequestException('Au moins une ligne est requise');
    }
    const quote = await this.prisma.$transaction(async (tx) => {
      if (dto.lineItems) {
        await tx.quoteLineItem.deleteMany({ where: { quoteId: id } });
      }
      return tx.quote.update({
        where: { id },
        data: {
          label: dto.label,
          clientName: dto.clientName,
          clientAddress: dto.clientAddress,
          clientEmail: dto.clientEmail,
          notes: dto.notes,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
          documentUrl: dto.documentUrl,
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
    this.audit.record({ actorId, action: 'UPDATE_QUOTE', entityType: 'quote', entityId: quote.id });
    return this.present(quote);
  }

  async setStatus(id: string, status: QuoteStatus, actorId: string) {
    const existing = await this.prisma.quote.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Devis introuvable');
    }
    if (existing.status !== status && !QUOTE_TRANSITIONS[existing.status].includes(status)) {
      throw new BadRequestException(
        `Transition de statut invalide : ${existing.status} → ${status}`,
      );
    }
    const quote = await this.prisma.quote.update({ where: { id }, data: { status }, include: INCLUDE });
    this.audit.record({ actorId, action: 'UPDATE_QUOTE', entityType: 'quote', entityId: quote.id, details: `status:${status}` });
    return this.present(quote);
  }

  async remove(id: string, actorId: string) {
    const existing = await this.prisma.quote.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Devis introuvable');
    }
    await this.prisma.quote.delete({ where: { id } });
    this.audit.record({ actorId, action: 'DELETE_QUOTE', entityType: 'quote', entityId: id, details: existing.number });
    return { deleted: true };
  }

  async buildPdf(id: string): Promise<Buffer> {
    const quote = await this.prisma.quote.findUnique({ where: { id }, include: INCLUDE });
    if (!quote) {
      throw new NotFoundException('Devis introuvable');
    }
    const company = this.settings.getCompanyInfo();
    return this.pdf.generate(
      {
        kind: 'DEVIS',
        number: quote.number,
        label: quote.label,
        clientName: quote.clientName,
        clientAddress: quote.clientAddress,
        clientEmail: quote.clientEmail,
        issuedAt: quote.issuedAt,
        dueAt: quote.dueAt,
        notes: quote.notes,
        lineItems: quote.lineItems,
      },
      company,
    );
  }

  async send(id: string, actorId: string) {
    const quote = await this.prisma.quote.findUnique({ where: { id } });
    if (!quote) {
      throw new NotFoundException('Devis introuvable');
    }
    if (!quote.clientEmail) {
      throw new BadRequestException("Aucun email client n'est renseigné sur ce devis");
    }
    const pdfBuffer = await this.buildPdf(id);
    await this.mailer.send(
      quote.clientEmail,
      `Devis ${quote.number} — ${quote.label}`,
      `<p>Bonjour,</p><p>Veuillez trouver ci-joint votre devis ${quote.number}.</p>`,
      {
        filename: `${quote.number}.pdf`,
        content: pdfBuffer.toString('base64'),
        type: 'application/pdf',
        encoding: 'base64',
      },
    );
    const updated = await this.prisma.quote.update({
      where: { id },
      data: { status: quote.status === 'DRAFT' ? 'SENT' : quote.status },
      include: INCLUDE,
    });
    this.audit.record({ actorId, action: 'SEND_QUOTE', entityType: 'quote', entityId: id, details: quote.clientEmail });
    return this.present(updated);
  }

  async convertToInvoice(id: string, actorId: string) {
    const quote = await this.prisma.quote.findUnique({ where: { id }, include: INCLUDE });
    if (!quote) {
      throw new NotFoundException('Devis introuvable');
    }
    if (quote.status !== 'ACCEPTED') {
      throw new BadRequestException('Seul un devis accepté peut être converti en facture');
    }
    const alreadyConverted = await this.prisma.invoice.findFirst({ where: { quoteId: quote.id } });
    if (alreadyConverted) {
      throw new BadRequestException(`Ce devis a déjà été converti en facture ${alreadyConverted.number}`);
    }
    const invoice = await this.invoices.create(
      {
        siteId: quote.siteId,
        quoteId: quote.id,
        label: quote.label,
        clientName: quote.clientName,
        clientAddress: quote.clientAddress ?? undefined,
        clientEmail: quote.clientEmail ?? undefined,
        notes: quote.notes ?? undefined,
        lineItems: quote.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPriceHT: item.unitPriceHT,
          vatRatePercent: item.vatRatePercent,
        })),
      },
      actorId,
    );
    this.audit.record({
      actorId,
      action: 'CONVERT_QUOTE_TO_INVOICE',
      entityType: 'quote',
      entityId: quote.id,
      details: `→ ${invoice.number}`,
    });
    return invoice;
  }
}
