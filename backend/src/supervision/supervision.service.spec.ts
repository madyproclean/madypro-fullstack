import { SupervisionService } from './supervision.service';

/**
 * Synthèse « Aujourd'hui » de la tablette superviseur. Jour de test : lundi 29 septembre 2026,
 * heure d'été (Paris = UTC+2). `now` = 08:20 à Paris.
 */
describe('SupervisionService.today', () => {
  const DAY = '2026-09-29';
  const NOW = new Date('2026-09-29T06:20:00.000Z'); // 08:20 à Paris
  const SUPERVISOR = { sub: 'sup-1', role: 'SUPERVISOR' };

  const person = (id: string) => ({ id, firstName: 'Agent', lastName: id, phone: `06${id}` });
  const intervention = (id: string, startTime: string, status: string, agentIds: string[], checkedIn: string[] = []) => ({
    id,
    siteId: 'site-a',
    site: { id: 'site-a', name: 'Site A', toleranceMinutes: null },
    startTime,
    endTime: '12:00',
    status,
    assignments: agentIds.map((userId) => ({ userId, user: person(userId) })),
    attendances: checkedIn.map((userId) => ({ userId, checkInTime: new Date('2026-09-29T05:55:00.000Z') })),
  });

  const build = (opts: { interventions: any[]; approvedAbsent?: string[]; pending?: any[]; siteIds?: string[] | null }) => {
    const prisma = {
      intervention: { findMany: jest.fn().mockResolvedValue(opts.interventions) },
      site: { count: jest.fn().mockResolvedValue(9) },
      absence: {
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve(
            where.status === 'APPROVED'
              ? (opts.approvedAbsent ?? []).map((userId) => ({ userId }))
              : (opts.pending ?? []),
          ),
        ),
      },
    };
    const settings = { getSettings: () => ({ attendanceRules: { toleranceMinutes: 10 } }) };
    const siteIds = opts.siteIds === undefined ? ['site-a'] : opts.siteIds;
    const scope = {
      siteIds: jest.fn().mockResolvedValue(siteIds),
      agentIds: jest.fn().mockResolvedValue(siteIds ? new Set(['a1', 'a2', 'a3']) : null),
    };
    return { service: new SupervisionService(prisma as any, settings as any, scope as any), prisma };
  };

  it("signale un retard seulement après l'heure de début + la tolérance, à l'heure de Paris", async () => {
    const { service } = build({
      interventions: [
        intervention('i-800', '08:00', 'PLANNED', ['a1']), // 08:10 dépassé → retard
        intervention('i-815', '08:15', 'PLANNED', ['a2']), // tolérance jusqu'à 08:25 → pas encore
      ],
    });
    const result = await service.today(SUPERVISOR, DAY, NOW);
    expect(result.tasks).toEqual([expect.objectContaining({ kind: 'LATE', agentId: 'a1', agentPhone: '06a1' })]);
    expect(result.agents).toEqual({ expected: 2, present: 0, late: 1, absent: 0 });
    expect(result.missions).toEqual(expect.objectContaining({ notStarted: 1, planned: 1 }));
  });

  it("ne compte pas en retard un agent qui a pointé", async () => {
    const { service } = build({ interventions: [intervention('i-1', '07:00', 'IN_PROGRESS', ['a1', 'a2'], ['a1'])] });
    const result = await service.today(SUPERVISOR, DAY, NOW);
    expect(result.agents).toEqual({ expected: 2, present: 1, late: 1, absent: 0 });
    expect(result.tasks.map((t) => t.kind === 'LATE' && t.agentId)).toEqual(['a2']);
  });

  it("signale une mission non couverte quand tous ses agents sont absents, sans les compter en retard", async () => {
    const { service } = build({
      interventions: [intervention('i-1', '07:00', 'PLANNED', ['a1'])],
      approvedAbsent: ['a1'],
    });
    const result = await service.today(SUPERVISOR, DAY, NOW);
    expect(result.tasks).toEqual([expect.objectContaining({ kind: 'UNCOVERED', interventionId: 'i-1' })]);
    expect(result.agents).toEqual({ expected: 1, present: 0, late: 0, absent: 1 });
  });

  it('liste les missions à valider et les absences en attente, les urgences en premier', async () => {
    const { service } = build({
      interventions: [
        intervention('i-done', '06:00', 'NEEDS_REVIEW', ['a1'], ['a1']),
        intervention('i-late', '08:00', 'PLANNED', ['a2']),
      ],
      pending: [
        {
          id: 'abs-1',
          userId: 'a3',
          type: 'SICK',
          from: new Date('2026-10-01T00:00:00Z'),
          to: new Date('2026-10-02T00:00:00Z'),
          user: { firstName: 'Agent', lastName: 'a3' },
        },
      ],
    });
    const result = await service.today(SUPERVISOR, DAY, NOW);
    expect(result.tasks.map((t) => t.kind)).toEqual(['LATE', 'TO_VALIDATE', 'ABSENCE']);
    expect(result.tasks[2]).toEqual(expect.objectContaining({ absenceId: 'abs-1', from: '2026-10-01', to: '2026-10-02' }));
    expect(result.missions.toValidate).toBe(1);
  });

  it('limite les requêtes aux sites et aux agents du superviseur', async () => {
    const { service, prisma } = build({ interventions: [] });
    const result = await service.today(SUPERVISOR, DAY, NOW);
    expect(prisma.intervention.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ siteId: { in: ['site-a'] } }) }),
    );
    expect(prisma.absence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING', userId: { in: ['a1', 'a2', 'a3'] } }) }),
    );
    expect(result.siteCount).toBe(1);
  });

  it("couvre tous les sites pour l'admin", async () => {
    const { service, prisma } = build({ interventions: [], siteIds: null });
    const result = await service.today({ sub: 'admin', role: 'ADMIN' }, DAY, NOW);
    const where = prisma.intervention.findMany.mock.calls[0][0].where;
    expect(where.siteId).toBeUndefined();
    expect(result.siteCount).toBe(9);
  });

  it('prend par défaut la date du jour à Paris', async () => {
    const { service } = build({ interventions: [] });
    // 23:30 UTC le 28 = 01:30 le 29 à Paris
    const result = await service.today(SUPERVISOR, undefined, new Date('2026-09-28T23:30:00.000Z'));
    expect(result.date).toBe('2026-09-29');
  });
});
