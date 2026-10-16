import PDFDocument from 'pdfkit';
import { CompanyInfo } from '../settings/settings.service';
import { BRAND_LOGO_MARK_BASE64 } from './brand-logo';

export type ClientReportData = {
  site: { name: string; address: string | null };
  monthLabel: string;
  totals: { planned: number; done: number; missed: number; cancelled: number; hours: number; checklistRate: number | null };
  visits: Array<{ date: string; slot: string; actual: string; agents: string; status: string; checklist: string }>;
  anomalies: Array<{ date: string; title: string; status: string }>;
  inspections: Array<{ date: string; score: number; remarks: string }>;
  photos: Buffer[];
};

const BRAND = '#0f98eb';
const BRAND_DARK = '#1b5ca0';
const INK = '#020912';
const MUTED = '#565656';
const LEFT = 50;
const RIGHT = 545;
const WIDTH = RIGHT - LEFT;
const BOTTOM = 760;
const logo = Buffer.from(BRAND_LOGO_MARK_BASE64, 'base64');

/** Compte rendu mensuel pour le client d'un site : passages, horaires réels, checklists, qualité, photos. */
export function generateClientReportPdf(data: ClientReportData, company: CompanyInfo): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let y = 50;
    const ensure = (needed: number) => {
      if (y + needed > BOTTOM) {
        doc.addPage();
        y = 50;
      }
    };
    const heading = (text: string) => {
      ensure(40);
      y += 10;
      doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND_DARK).text(text, LEFT, y);
      y += 18;
      doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.75).strokeColor(BRAND).stroke();
      y += 8;
    };

    try {
      doc.image(logo, LEFT, y, { width: 36 });
    } catch {
      // logo facultatif
    }
    doc.font('Helvetica-Bold').fontSize(15).fillColor(INK).text(company.legalName || 'Mady Proclean', LEFT + 46, y + 2);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text([company.address, company.phone, company.email].filter(Boolean).join(' · '), LEFT + 46, y + 20, { width: WIDTH - 46 });
    y += 56;
    doc.font('Helvetica-Bold').fontSize(13).fillColor(BRAND_DARK).text('COMPTE RENDU DE PRESTATIONS', LEFT, y);
    y += 18;
    doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(data.site.name, LEFT, y);
    y += 20;
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`${data.site.address ?? ''}${data.site.address ? ' · ' : ''}${data.monthLabel}`, LEFT, y);
    y += 24;

    const kpis: [string, string][] = [
      ['Passages prévus', String(data.totals.planned)],
      ['Passages réalisés', String(data.totals.done)],
      ['Non réalisés', String(data.totals.missed)],
      ['Annulés', String(data.totals.cancelled)],
      ['Heures de présence', `${data.totals.hours} h`],
      ['Checklists complétées', data.totals.checklistRate === null ? '—' : `${data.totals.checklistRate} %`],
    ];
    kpis.forEach(([label, value], i) => {
      const x = LEFT + (i % 3) * (WIDTH / 3);
      const row = y + Math.floor(i / 3) * 34;
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, row, { characterSpacing: 0.4 });
      doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(value, x, row + 11);
    });
    y += 76;

    heading('Passages du mois');
    const cols = [
      { label: 'DATE', x: 50, w: 62 },
      { label: 'PRÉVU', x: 114, w: 66 },
      { label: 'RÉEL', x: 182, w: 66 },
      { label: 'AGENTS', x: 250, w: 130 },
      { label: 'CHECKLIST', x: 382, w: 60 },
      { label: 'STATUT', x: 444, w: 101 },
    ];
    const header = () => {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
      cols.forEach((c) => doc.text(c.label, c.x, y, { width: c.w }));
      y += 14;
    };
    header();
    if (!data.visits.length) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Aucun passage sur la période.', LEFT, y);
      y += 14;
    }
    for (const v of data.visits) {
      if (y + 14 > BOTTOM) {
        doc.addPage();
        y = 50;
        header();
      }
      doc.font('Helvetica').fontSize(8.5).fillColor(INK);
      [v.date, v.slot, v.actual, v.agents, v.checklist, v.status].forEach((text, i) =>
        doc.text(text, cols[i].x, y, { width: cols[i].w, height: 12, ellipsis: true }),
      );
      y += 14;
    }

    heading('Contrôles qualité');
    if (!data.inspections.length) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Aucun contrôle ce mois-ci.', LEFT, y);
      y += 14;
    }
    for (const q of data.inspections) {
      ensure(30);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(q.score >= 80 ? '#2e8b57' : q.score >= 60 ? '#b9791e' : '#c24a3e').text(`${q.date} · ${q.score} / 100`, LEFT, y);
      y += 13;
      if (q.remarks) {
        doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(q.remarks, LEFT, y, { width: WIDTH });
        y = doc.y + 4;
      }
    }

    heading('Incidents signalés');
    if (!data.anomalies.length) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Aucun incident ce mois-ci.', LEFT, y);
      y += 14;
    }
    for (const a of data.anomalies) {
      ensure(14);
      doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(`${a.date} · ${a.title} · ${a.status}`, LEFT, y, { width: WIDTH });
      y += 13;
    }

    if (data.photos.length) {
      heading('Photos');
      const size = 150;
      let x = LEFT;
      for (const photo of data.photos) {
        if (x + size > RIGHT + 1) {
          x = LEFT;
          y += size + 10;
        }
        ensure(size + 10);
        try {
          doc.image(photo, x, y, { fit: [size, size] });
          x += size + 12;
        } catch {
          // photo illisible : ignorée
        }
      }
      y += size + 10;
    }

    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(`Document généré le ${new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}`, LEFT, 790, { width: WIDTH, align: 'center' });
    doc.end();
  });
}
