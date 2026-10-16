import { InterventionsService } from './interventions.service';
import { isFrenchPublicHoliday } from '../common/utils/french-holidays';

function build(template: any, pauses: any[] = []) {
  const prisma: any = {
    interventionTemplate: { findUnique: jest.fn().mockResolvedValue(template) },
    templateException: { findMany: jest.fn().mockResolvedValue([]) },
    templatePause: { findMany: jest.fn().mockResolvedValue(pauses) },
    site: { findMany: jest.fn().mockResolvedValue([{ id: 'site-a', name: 'Site A' }]) },
  };
  return new InterventionsService(prisma, {} as any, {} as any, {} as any, {} as any, { get: () => undefined } as any, {} as any, {} as any);
}

const template = (skipHolidays: boolean) => ({
  id: 'tpl-1',
  label: 'Gabarit A',
  siteId: 'site-a',
  startDate: new Date('2026-10-01T00:00:00Z'),
  endDate: null,
  skipHolidays,
  stops: [{ id: 's1', daysOfWeek: [1, 2, 3, 4, 5], intervalWeeks: 1, specificDate: null, categoryId: null, startTime: '06:00', endTime: '08:00', agentIds: ['a'] }],
});

describe('calendrier des gabarits', () => {
  it('connaît les jours fériés français (11 novembre, lundi de Pâques)', () => {
    expect(isFrenchPublicHoliday('2026-11-11')).toBe(true);
    expect(isFrenchPublicHoliday('2026-04-06')).toBe(true);
    expect(isFrenchPublicHoliday('2026-11-12')).toBe(false);
  });

  it('saute les jours fériés quand le gabarit le demande', async () => {
    const without = await build(template(false)).previewTemplateOccurrences('tpl-1', '2026-11-09', '2026-11-13');
    const skipping = await build(template(true)).previewTemplateOccurrences('tpl-1', '2026-11-09', '2026-11-13');
    expect(without.occurrences.map((o) => o.date)).toContain('2026-11-11');
    expect(skipping.occurrences.map((o) => o.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-12', '2026-11-13']);
  });

  it('ne prévoit aucun passage pendant une fermeture', async () => {
    const service = build(template(false), [
      { templateId: 'tpl-1', from: new Date('2026-12-21T00:00:00Z'), to: new Date('2026-12-31T00:00:00Z') },
    ]);
    const result = await service.previewTemplateOccurrences('tpl-1', '2026-12-17', '2027-01-05');
    const dates = result.occurrences.map((o) => o.date);
    expect(dates.some((d) => d >= '2026-12-21' && d <= '2026-12-31')).toBe(false);
    expect(dates).toContain('2026-12-18');
    expect(dates).toContain('2027-01-01');
  });
});
