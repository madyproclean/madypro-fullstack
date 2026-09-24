import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { CompanyInfo } from '../settings/settings.service';
import { computeTotals, LineItemLike } from './line-items.util';
import { BRAND_LOGO_MARK_BASE64 } from './brand-logo';

export type PdfLineItem = LineItemLike & { description: string };

export type HoursQuotaReportAgent = {
  name: string;
  siteName: string;
  plannedMinutes: number;
  realizedMinutes: number;
  accomplishmentRate: number | null;
  meetsQuota: boolean;
  penaltyMinutes: number;
};

export type HoursQuotaReportData = {
  period: { startDate: string; endDate: string };
  threshold: number;
  agentReports: HoursQuotaReportAgent[];
};

export type SiteDossierEntry = {
  siteId: string;
  siteName: string;
  totalMinutes: number;
  punctualityRate: number | null;
  uncoveredDays: number;
  agentsInvolved: string[];
  interventionsTotal: number;
  completionRate: number | null;
  anomalyCount: number;
  billableHours: number;
  internalHours: number;
  quota: { threshold: number; agents: HoursQuotaReportAgent[] };
};

export type SiteDossierReportData = {
  period: { startDate: string; endDate: string };
  sites: SiteDossierEntry[];
};

export type PdfDocumentData = {
  kind: 'DEVIS' | 'FACTURE';
  number: string;
  label: string;
  clientName: string;
  clientAddress?: string | null;
  clientEmail?: string | null;
  issuedAt: Date;
  dueAt?: Date | null;
  notes?: string | null;
  lineItems: PdfLineItem[];
  paymentInfo?: { paidAt?: Date | null; paymentMethod?: string | null } | null;
};

// Palette de marque Mady Proclean (source unique : web/src/styles/tokens.scss).
const BRAND = '#0f98eb';
const BRAND_DARK = '#1b5ca0';
const INK = '#020912';
const MUTED = '#565656';
const LINE_GRAY = '#dde5ef';

const PAGE_LEFT = 50;
const PAGE_RIGHT = 545;
const PAGE_WIDTH = PAGE_RIGHT - PAGE_LEFT;

const COL = {
  desc: { x: 50, width: 225 },
  qty: { x: 280, width: 45 },
  price: { x: 330, width: 75 },
  vat: { x: 410, width: 45 },
  total: { x: 460, width: 85 },
};

const TABLE_BOTTOM_LIMIT = 690;

const logoBuffer = Buffer.from(BRAND_LOGO_MARK_BASE64, 'base64');

@Injectable()
export class DocumentPdfService {
  generate(data: PdfDocumentData, company: CompanyInfo): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const totals = computeTotals(data.lineItems);
      const title = data.kind === 'DEVIS' ? 'DEVIS' : 'FACTURE';

      // --- En-tête : bloc émetteur (gauche) + bloc document (droite) ---
      const badgeR = 14;
      const badgeCx = PAGE_LEFT + badgeR;
      const badgeCy = 50 + badgeR;
      doc.save();
      doc.circle(badgeCx, badgeCy, badgeR).clip();
      doc.image(logoBuffer, badgeCx - badgeR, badgeCy - badgeR, { width: badgeR * 2, height: badgeR * 2 });
      doc.restore();

      const nameX = PAGE_LEFT + badgeR * 2 + 10;
      doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .fillColor(BRAND_DARK)
        .text(company.legalName || 'Mady Proclean', nameX, 50, { width: 250 - (nameX - PAGE_LEFT) });

      let leftY = 50 + 34;
      doc.font('Helvetica').fontSize(9).fillColor(MUTED);
      if (company.address) {
        doc.text(company.address, PAGE_LEFT, leftY, { width: 250 });
        leftY += 13;
      }
      const legalLine = [company.siret ? `SIRET ${company.siret}` : null, company.vatNumber ? `TVA ${company.vatNumber}` : null]
        .filter(Boolean)
        .join(' — ');
      if (legalLine) {
        doc.text(legalLine, PAGE_LEFT, leftY, { width: 250 });
        leftY += 13;
      }
      const contactLine = [company.phone, company.email].filter(Boolean).join(' — ');
      if (contactLine) {
        doc.text(contactLine, PAGE_LEFT, leftY, { width: 250 });
        leftY += 13;
      }

      const rightBoxX = 300;
      const rightBoxWidth = PAGE_RIGHT - rightBoxX;
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(MUTED)
        .text(title, rightBoxX, 50, { width: rightBoxWidth, align: 'right', characterSpacing: 1.2 });
      doc
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor(BRAND_DARK)
        .text(data.number, rightBoxX, 64, { width: rightBoxWidth, align: 'right' });

      let rightY = 64 + 28;
      rightY = this.drawLabelValueRight(doc, 'Émise le', data.issuedAt.toLocaleDateString('fr-FR'), rightY);
      if (data.dueAt) {
        rightY = this.drawLabelValueRight(doc, 'Échéance', data.dueAt.toLocaleDateString('fr-FR'), rightY);
      }

      const headerBottom = Math.max(leftY, rightY) + 12;
      doc
        .moveTo(PAGE_LEFT, headerBottom)
        .lineTo(PAGE_RIGHT, headerBottom)
        .lineWidth(1.2)
        .strokeColor(BRAND_DARK)
        .stroke();
      doc.lineWidth(1);

      // --- Émetteur / Facturé à ---
      const blockY = headerBottom + 20;
      this.drawPartyBlock(doc, 'ÉMETTEUR', company.legalName || 'Mady Proclean', company.address, null, PAGE_LEFT, blockY);
      const partyBottom = this.drawPartyBlock(
        doc,
        'FACTURÉ À',
        data.clientName,
        data.clientAddress,
        data.clientEmail,
        rightBoxX,
        blockY,
      );

      doc.font('Helvetica').fontSize(9.5).fillColor(MUTED);

      let y = partyBottom + 20;
      doc.fillColor(INK);

      y = this.drawTableHeader(doc, y);

      doc.font('Helvetica').fontSize(9.5).fillColor(INK);
      for (const item of data.lineItems) {
        if (y > TABLE_BOTTOM_LIMIT) {
          doc.addPage();
          y = this.drawTableHeader(doc, 50);
          doc.font('Helvetica').fontSize(9.5).fillColor(INK);
        }
        const lineTotal = item.quantity * item.unitPriceHT;
        doc.font('Helvetica').text(item.description, COL.desc.x, y, { width: COL.desc.width });
        doc.text(String(item.quantity), COL.qty.x, y, { width: COL.qty.width, align: 'right' });
        doc.text(`${item.unitPriceHT.toFixed(2)} €`, COL.price.x, y, { width: COL.price.width, align: 'right' });
        doc.text(`${item.vatRatePercent} %`, COL.vat.x, y, { width: COL.vat.width, align: 'right' });
        doc
          .font('Helvetica-Bold')
          .text(`${lineTotal.toFixed(2)} €`, COL.total.x, y, { width: COL.total.width, align: 'right' });
        y += 19;
      }
      doc.moveTo(PAGE_LEFT, y + 4).lineTo(PAGE_RIGHT, y + 4).lineWidth(0.75).strokeColor(LINE_GRAY).stroke();

      // --- Totaux ---
      const totalsX = 350;
      const totalsLabelWidth = 100;
      const totalsValueX = totalsX + totalsLabelWidth;
      const totalsValueWidth = PAGE_RIGHT - totalsValueX;

      y += 16;
      doc.font('Helvetica').fontSize(9.5).fillColor(MUTED);
      doc.text('Sous-total HT', totalsX, y, { width: totalsLabelWidth });
      doc.fillColor(INK).text(`${totals.totalHT.toFixed(2)} €`, totalsValueX, y, { width: totalsValueWidth, align: 'right' });

      y += 16;
      const uniqueVatRates = Array.from(new Set(data.lineItems.map((i) => i.vatRatePercent)));
      const vatLabel = uniqueVatRates.length === 1 ? `TVA ${uniqueVatRates[0]} %` : 'TVA';
      doc.fillColor(MUTED).text(vatLabel, totalsX, y, { width: totalsLabelWidth });
      doc.fillColor(INK).text(`${totals.totalVAT.toFixed(2)} €`, totalsValueX, y, { width: totalsValueWidth, align: 'right' });

      y += 14;
      doc.moveTo(totalsX, y).lineTo(PAGE_RIGHT, y).lineWidth(0.5).strokeColor(LINE_GRAY).stroke();
      y += 2;
      doc.moveTo(totalsX, y).lineTo(PAGE_RIGHT, y).lineWidth(1.5).strokeColor(BRAND_DARK).stroke();
      doc.lineWidth(1);

      y += 10;
      doc.font('Helvetica-Bold').fontSize(13).fillColor(BRAND_DARK);
      doc.text('Total TTC', totalsX, y, { width: totalsLabelWidth });
      doc.text(`${totals.totalTTC.toFixed(2)} €`, totalsValueX, y, { width: totalsValueWidth, align: 'right' });
      doc.fillColor(INK);

      y += 34;

      // --- Paiement ---
      if (company.iban) {
        const dayCount = data.dueAt
          ? Math.round((data.dueAt.getTime() - data.issuedAt.getTime()) / 86400000)
          : null;
        const termsPart = dayCount && dayCount > 0 ? `${dayCount} jours nets, ` : '';
        const ibanPart = `IBAN ${company.iban}${company.bic ? ` — BIC ${company.bic}` : ''}`;
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(BRAND_DARK).text('Paiement : ', PAGE_LEFT, y, { continued: true });
        doc
          .font('Helvetica')
          .fillColor(MUTED)
          .text(`${termsPart}virement bancaire — ${ibanPart}`);
        doc.fillColor(INK);
        y += 16;
      }

      if (data.paymentInfo?.paidAt) {
        const paidLabel = `Payé le ${data.paymentInfo.paidAt.toLocaleDateString('fr-FR')}${
          data.paymentInfo.paymentMethod ? ` (${data.paymentInfo.paymentMethod})` : ''
        }`;
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1f7a4d').text(paidLabel, PAGE_LEFT, y);
        doc.fillColor(INK);
        y += 16;
      }

      if (data.notes) {
        y += 8;
        doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(data.notes, PAGE_LEFT, y, { width: PAGE_WIDTH });
        doc.fillColor(INK);
      }

      // --- Mentions légales ---
      const mentions: string[] = [];
      if (data.kind === 'FACTURE') {
        mentions.push(
          "En cas de retard de paiement, application d'une pénalité au taux d'intérêt légal en vigueur majoré de 3 points, ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 et D441-5 du Code de commerce).",
        );
        mentions.push("Pas d'escompte pour paiement anticipé.");
      }
      if (mentions.length) {
        doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(mentions.join('\n'), PAGE_LEFT, 735, {
          width: PAGE_WIDTH,
          align: 'center',
        });
        doc.fillColor(INK);
      }

      const footerParts = [
        company.legalName,
        company.address,
        company.siret ? `SIRET ${company.siret}` : null,
        company.vatNumber ? `TVA ${company.vatNumber}` : null,
      ].filter(Boolean);
      if (footerParts.length) {
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor('#8a8a8a')
          .text(footerParts.join(' · '), PAGE_LEFT, 778, { width: PAGE_WIDTH, align: 'center' });
        doc.fillColor(INK);
      }

      doc.end();
    });
  }

  private drawLabelValueRight(doc: PDFKit.PDFDocument, label: string, value: string, y: number): number {
    doc.font('Helvetica').fontSize(9);
    const labelText = `${label} `;
    const labelWidth = doc.widthOfString(labelText);
    doc.font('Helvetica-Bold');
    const valueWidth = doc.widthOfString(value);
    const startX = PAGE_RIGHT - labelWidth - valueWidth;

    doc.font('Helvetica').fillColor(MUTED).text(labelText, startX, y, { lineBreak: false });
    doc.font('Helvetica-Bold').fillColor(INK).text(value, startX + labelWidth, y, { lineBreak: false });
    doc.fillColor(INK);
    return y + 14;
  }

  private drawPartyBlock(
    doc: PDFKit.PDFDocument,
    heading: string,
    name: string,
    address: string | null | undefined,
    email: string | null | undefined,
    x: number,
    y: number,
  ): number {
    const width = 245;
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(BRAND_DARK)
      .text(heading, x, y, { width, characterSpacing: 1 });
    let cursorY = y + 15;
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(name, x, cursorY, { width });
    cursorY += 14;
    if (address) {
      doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(address, x, cursorY, { width });
      cursorY += 13 * address.split('\n').length;
    }
    if (email) {
      doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(email, x, cursorY, { width });
      cursorY += 13;
    }
    doc.fillColor(INK);
    return cursorY;
  }

  generateHoursQuotaReport(data: HoursQuotaReportData, company: CompanyInfo): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const fmtHours = (minutes: number) => `${Math.floor(minutes / 60)}h${String(Math.round(minutes % 60)).padStart(2, '0')}`;
      const fmtRate = (rate: number | null) => (rate === null ? '—' : `${rate}%`);

      doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(company.legalName || 'Rapport', PAGE_LEFT, 50);
      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor(BRAND_DARK)
        .text('QUOTA D\'HEURES MENSUEL', PAGE_LEFT, 80);
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(MUTED)
        .text(
          `Période du ${data.period.startDate} au ${data.period.endDate} — seuil d'accomplissement : ${data.threshold}%`,
          PAGE_LEFT,
          100,
        );

      const cols = {
        site: { x: 50, width: 110 },
        agent: { x: 160, width: 130 },
        planned: { x: 290, width: 65 },
        realized: { x: 355, width: 65 },
        rate: { x: 420, width: 50 },
        penalty: { x: 470, width: 75 },
      };

      let y = 130;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
      doc.text('SITE', cols.site.x, y, { width: cols.site.width, characterSpacing: 0.5 });
      doc.text('AGENT', cols.agent.x, y, { width: cols.agent.width, characterSpacing: 0.5 });
      doc.text('PRÉVU', cols.planned.x, y, { width: cols.planned.width, align: 'right' });
      doc.text('RÉALISÉ', cols.realized.x, y, { width: cols.realized.width, align: 'right' });
      doc.text('%', cols.rate.x, y, { width: cols.rate.width, align: 'right' });
      doc.text('PÉNALITÉ', cols.penalty.x, y, { width: cols.penalty.width, align: 'right' });
      doc.fillColor(INK);
      y += 13;
      doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).lineWidth(0.75).strokeColor(BRAND).stroke();
      doc.lineWidth(1);
      y += 10;

      data.agentReports.forEach((agent) => {
        if (y > TABLE_BOTTOM_LIMIT) {
          doc.addPage();
          y = 50;
        }
        doc.font('Helvetica').fontSize(9).fillColor(INK);
        doc.text(agent.siteName, cols.site.x, y, { width: cols.site.width });
        doc.text(agent.name, cols.agent.x, y, { width: cols.agent.width });
        doc.text(fmtHours(agent.plannedMinutes), cols.planned.x, y, { width: cols.planned.width, align: 'right' });
        doc.text(fmtHours(agent.realizedMinutes), cols.realized.x, y, { width: cols.realized.width, align: 'right' });
        doc.text(fmtRate(agent.accomplishmentRate), cols.rate.x, y, { width: cols.rate.width, align: 'right' });
        doc
          .fillColor(agent.meetsQuota ? MUTED : '#c0392b')
          .text(agent.meetsQuota ? '—' : fmtHours(agent.penaltyMinutes), cols.penalty.x, y, {
            width: cols.penalty.width,
            align: 'right',
          })
          .fillColor(INK);
        y += 16;
      });

      doc.end();
    });
  }

  generateSiteDossierReport(data: SiteDossierReportData, company: CompanyInfo): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const fmtHours = (minutes: number) => `${Math.floor(minutes / 60)}h${String(Math.round(minutes % 60)).padStart(2, '0')}`;
      const fmtRate = (rate: number | null) => (rate === null ? '—' : `${rate}%`);

      data.sites.forEach((site, index) => {
        if (index > 0) doc.addPage();

        doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(company.legalName || 'Rapport', PAGE_LEFT, 50);
        doc.font('Helvetica-Bold').fontSize(13).fillColor(BRAND_DARK).text('DOSSIER DE SITE', PAGE_LEFT, 80);
        doc.font('Helvetica-Bold').fontSize(15).fillColor(INK).text(site.siteName, PAGE_LEFT, 100);
        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor(MUTED)
          .text(`Période du ${data.period.startDate} au ${data.period.endDate}`, PAGE_LEFT, 120);

        // --- KPIs ---
        const kpis: [string, string][] = [
          ['Heures réalisées', fmtHours(site.totalMinutes)],
          ['Ponctualité', fmtRate(site.punctualityRate)],
          ['Jours non couverts', String(site.uncoveredDays)],
          ['Interventions', String(site.interventionsTotal)],
          ['Taux de complétion', fmtRate(site.completionRate)],
          ['Anomalies', String(site.anomalyCount)],
          ['Heures facturables', `${site.billableHours} h`],
          ['Heures internes', `${site.internalHours} h`],
        ];
        let ky = 150;
        const kpiColWidth = PAGE_WIDTH / 2;
        kpis.forEach(([label, value], i) => {
          const x = PAGE_LEFT + (i % 2) * kpiColWidth;
          const rowY = ky + Math.floor(i / 2) * 32;
          doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, rowY, { characterSpacing: 0.5 });
          doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(value, x, rowY + 12);
        });
        ky += Math.ceil(kpis.length / 2) * 32 + 15;

        // --- Agents / quota ---
        doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND_DARK).text('Agents — quota d\'heures', PAGE_LEFT, ky);
        ky += 20;

        const cols = {
          agent: { x: 50, width: 180 },
          planned: { x: 240, width: 75 },
          realized: { x: 320, width: 75 },
          rate: { x: 400, width: 55 },
          penalty: { x: 460, width: 85 },
        };
        doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
        doc.text('AGENT', cols.agent.x, ky, { width: cols.agent.width, characterSpacing: 0.5 });
        doc.text('PRÉVU', cols.planned.x, ky, { width: cols.planned.width, align: 'right' });
        doc.text('RÉALISÉ', cols.realized.x, ky, { width: cols.realized.width, align: 'right' });
        doc.text('%', cols.rate.x, ky, { width: cols.rate.width, align: 'right' });
        doc.text('PÉNALITÉ', cols.penalty.x, ky, { width: cols.penalty.width, align: 'right' });
        doc.fillColor(INK);
        ky += 13;
        doc.moveTo(PAGE_LEFT, ky).lineTo(PAGE_RIGHT, ky).lineWidth(0.75).strokeColor(BRAND).stroke();
        doc.lineWidth(1);
        ky += 10;

        if (site.quota.agents.length === 0) {
          doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Aucun agent sur la période.', cols.agent.x, ky);
        }
        site.quota.agents.forEach((agent) => {
          if (ky > TABLE_BOTTOM_LIMIT) {
            doc.addPage();
            ky = 50;
          }
          doc.font('Helvetica').fontSize(9).fillColor(INK);
          doc.text(agent.name, cols.agent.x, ky, { width: cols.agent.width });
          doc.text(fmtHours(agent.plannedMinutes), cols.planned.x, ky, { width: cols.planned.width, align: 'right' });
          doc.text(fmtHours(agent.realizedMinutes), cols.realized.x, ky, { width: cols.realized.width, align: 'right' });
          doc.text(fmtRate(agent.accomplishmentRate), cols.rate.x, ky, { width: cols.rate.width, align: 'right' });
          doc
            .fillColor(agent.meetsQuota ? MUTED : '#c0392b')
            .text(agent.meetsQuota ? '—' : fmtHours(agent.penaltyMinutes), cols.penalty.x, ky, {
              width: cols.penalty.width,
              align: 'right',
            })
            .fillColor(INK);
          ky += 16;
        });
      });

      if (data.sites.length === 0) {
        doc.font('Helvetica').fontSize(11).fillColor(MUTED).text('Aucun site pour cette période.', PAGE_LEFT, 150);
      }

      doc.end();
    });
  }

  private drawTableHeader(doc: PDFKit.PDFDocument, y: number): number {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
    doc.text('DESCRIPTION', COL.desc.x, y, { width: COL.desc.width, characterSpacing: 0.5 });
    doc.text('QTÉ', COL.qty.x, y, { width: COL.qty.width, align: 'right', characterSpacing: 0.5 });
    doc.text('PU HT', COL.price.x, y, { width: COL.price.width, align: 'right', characterSpacing: 0.5 });
    doc.text('TVA', COL.vat.x, y, { width: COL.vat.width, align: 'right', characterSpacing: 0.5 });
    doc.text('TOTAL HT', COL.total.x, y, { width: COL.total.width, align: 'right', characterSpacing: 0.5 });
    doc.fillColor(INK);
    const ruleY = y + 13;
    doc.moveTo(PAGE_LEFT, ruleY).lineTo(PAGE_RIGHT, ruleY).lineWidth(0.75).strokeColor(BRAND).stroke();
    doc.lineWidth(1);
    return ruleY + 12;
  }
}
