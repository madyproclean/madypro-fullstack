import { SupervisionInsightsService } from './supervision-insights.service';

const day = '2026-10-15';
const user = (id: string, firstName: string) => ({ id, firstName, lastName: 'Test' });

function build(interventions: any[], scopeSites: string[] | null = ['site-a']) {
  const prisma: any = {
    intervention: { findMany: jest.fn().mockResolvedValue(interventions) },
    absence: { findMany: jest.fn().mockResolvedValue([]) },
    qualityInspection: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'q1', createdAt: new Date(), ...data })) },
  };
  const settings = { getSettings: () => ({ attendanceRules: { toleranceMinutes: 10 } }) };
  const scope = { siteIds: jest.fn().mockResolvedValue(scopeSites), assertSite: jest.fn().mockResolvedValue(undefined) };
  return { service: new SupervisionInsightsService(prisma, settings as any, scope as any), prisma };
}

describe('bilan de fin de journée', () => {
  it('compte missions, retards et heures sur les sites du superviseur', async () => {
    const { service, prisma } = build([
      {
        id: 'm1',
        status: 'COMPLETED',
        startTime: '06:00',
        endTime: '08:00',
        site: { name: 'Bofinger', toleranceMinutes: null },
        assignments: [{ userId: 'a1', user: user('a1', 'Tino') }],
        // Paris (heure d'été) : 06:25 = 04:25 UTC → 25 min de retard
        attendances: [{ userId: 'a1', checkInTime: new Date('2026-10-15T04:25:00Z'), checkOutTime: new Date('2026-10-15T06:05:00Z') }],
        anomalies: [],
      },
      {
        id: 'm2',
        status: 'NEEDS_REVIEW',
        startTime: '09:00',
        endTime: '11:00',
        site: { name: 'Maida', toleranceMinutes: null },
        assignments: [{ userId: 'a2', user: user('a2', 'Daouda') }],
        attendances: [{ userId: 'a2', checkInTime: new Date('2026-10-15T07:00:00Z'), checkOutTime: new Date('2026-10-15T09:00:00Z') }],
        anomalies: [{ id: 'an1', type: 'MATERIEL', title: 'Aspirateur en panne', description: 'HS', status: 'NEW', createdAt: new Date(), user: user('a2', 'Daouda') }],
      },
      {
        id: 'm3',
        status: 'PLANNED',
        startTime: '12:00',
        endTime: '13:00',
        site: { name: 'Auteuil', toleranceMinutes: null },
        assignments: [{ userId: 'a3', user: user('a3', 'Eric') }],
        attendances: [],
        anomalies: [],
      },
    ]);
    const summary = await service.daySummary({ id: 'sup', role: 'SUPERVISOR' } as any, day, new Date('2026-10-15T20:00:00Z'));
    expect(prisma.intervention.findMany.mock.calls[0][0].where.siteId).toEqual({ in: ['site-a'] });
    expect(summary.missions).toEqual(expect.objectContaining({ total: 3, completed: 1, toValidate: 1, notDone: 1 }));
    expect(summary.late).toEqual([expect.objectContaining({ agentName: 'Tino Test', minutesLate: 25 })]);
    expect(summary.punctuality.onTimeRate).toBe(50);
    expect(summary.hours).toEqual({ planned: 5, worked: 3.7 });
    expect(summary.anomalyCount).toEqual({ total: 1, open: 1 });
  });
});

describe('contrôle qualité', () => {
  it('calcule la note sur 100 depuis la grille', async () => {
    const { service, prisma } = build([]);
    const result = await service.createInspection({ sub: 'sup', role: 'SUPERVISOR' } as any, 'site-a', {
      items: [
        { label: 'Sols', rating: 'GOOD' },
        { label: 'Sanitaires', rating: 'AVERAGE' },
        { label: 'Vitres', rating: 'POOR', comment: ' traces ' },
      ],
    });
    expect(result.score).toBe(50);
    expect(prisma.qualityInspection.create.mock.calls[0][0].data.items[2]).toEqual({ label: 'Vitres', rating: 'POOR', comment: 'traces' });
  });

  it('refuse un contrôle sans critère noté', async () => {
    const { service } = build([]);
    await expect(service.createInspection({ sub: 'sup' } as any, 'site-a', { items: [] })).rejects.toThrow('Notez au moins un critère');
  });
});
