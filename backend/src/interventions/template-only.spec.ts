import { BadRequestException } from '@nestjs/common';
import { assertNoPlanningChange, InterventionsService } from './interventions.service';

/** Le gabarit du site est la seule source du planning des missions. */
describe('missions issues du gabarit uniquement', () => {
  const service = new InterventionsService({} as any, {} as any, {} as any, {} as any, {} as any, { get: () => undefined } as any, {} as any, {} as any);
  const base = { type: 'REGULAR' as const, siteId: 'site-a', date: '2026-10-14', startTime: '08:00', endTime: '10:00', agentIds: [] };

  it('refuse toute création qui ne vient pas d’un créneau de gabarit', async () => {
    await expect(service.create(base)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...base, generatedFromTemplateId: 'tpl-1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([['date'], ['startTime'], ['endTime'], ['siteId'], ['agentIds'], ['categoryId'], ['label'], ['type']])(
    'refuse la modification du champ de planning « %s »',
    (field) => {
      expect(() => assertNoPlanningChange({ [field]: field === 'agentIds' ? [] : 'x' })).toThrow(/gabarit/);
    },
  );

  it('laisse modifier le suivi de la mission (statut, observation, photos, facturation)', () => {
    expect(() =>
      assertNoPlanningChange({ status: 'COMPLETED', observation: 'ok', photos: [], truckLabels: ['T1'], billable: false }),
    ).not.toThrow();
  });
});
