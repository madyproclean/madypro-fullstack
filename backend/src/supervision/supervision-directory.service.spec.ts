import { ForbiddenException } from '@nestjs/common';
import { SupervisionDirectoryService } from './supervision-directory.service';

/**
 * Annuaire de la tablette superviseur. Jour de test : mardi 29 septembre 2026, heure d'été
 * (Paris = UTC+2). `now` = 10:00 à Paris.
 */
describe('SupervisionDirectoryService', () => {
  const NOW = new Date('2026-09-29T08:00:00.000Z');
  const SUPERVISOR = { sub: 'sup-1', role: 'SUPERVISOR' };
  const checkIn = new Date('2026-09-29T05:58:00.000Z');

  const mission = (startTime: string, endTime: string, userId: string, att?: { in?: Date; out?: Date }, status = 'PLANNED') => ({
    status,
    startTime,
    endTime,
    site: { name: 'Site A', toleranceMinutes: null },
    assignments: [{ userId }],
    attendances: att ? [{ userId, checkInTime: att.in ?? null, checkOutTime: att.out ?? null }] : [],
  });

  const build = (opts: {
    agents?: any[];
    dayMissions?: any[];
    absentIds?: string[];
    scopeAgents?: string[] | null;
    assignments?: any[];
  }) => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue(opts.agents ?? []),
        findUnique: jest.fn().mockResolvedValue(opts.agents?.[0] ?? null),
      },
      intervention: {
        findMany: jest.fn(({ select }: any) =>
          // Missions du jour (select avec attendances) ; les autres appels renvoient une liste vide.
          Promise.resolve(select?.attendances && select?.assignments ? (opts.dayMissions ?? []) : []),
        ),
      },
      interventionAssignment: { findMany: jest.fn().mockResolvedValue(opts.assignments ?? []) },
      absence: {
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve(where.status === 'APPROVED' ? (opts.absentIds ?? []).map((userId) => ({ userId })) : []),
        ),
      },
      certification: { groupBy: jest.fn().mockResolvedValue([{ userId: 'a1', _count: { _all: 2 } }]) },
    };
    const settings = { getSettings: () => ({ attendanceRules: { toleranceMinutes: 10 } }) };
    const scopeAgents = opts.scopeAgents === undefined ? ['a1', 'a2', 'a3', 'a4'] : opts.scopeAgents;
    const scope = {
      siteIds: jest.fn().mockResolvedValue(scopeAgents ? ['site-a'] : null),
      agentIds: jest.fn().mockResolvedValue(scopeAgents ? new Set(scopeAgents) : null),
      assertAgent: jest.fn(async (_v: any, id: string) => {
        if (scopeAgents && !scopeAgents.includes(id)) throw new ForbiddenException();
      }),
      assertSite: jest.fn(async (_v: any, id: string) => {
        if (scopeAgents && id !== 'site-a') throw new ForbiddenException();
      }),
    };
    return { service: new SupervisionDirectoryService(prisma as any, settings as any, scope as any), prisma };
  };

  const agent = (id: string) => ({ id, firstName: 'Agent', lastName: id, phone: `06${id}`, email: `${id}@x.test` });

  describe('team', () => {
    it("donne le statut du jour de chaque agent : sur place, en retard, prévu, absent, sans mission", async () => {
      const { service, prisma } = build({
        agents: ['a1', 'a2', 'a3', 'a4', 'a5'].map(agent),
        absentIds: ['a4'],
        dayMissions: [
          mission('08:00', '12:00', 'a1', { in: checkIn }), // arrivé, pas reparti
          mission('09:30', '12:00', 'a2'), // 09:40 dépassé → en retard
          mission('14:00', '17:00', 'a3'), // plus tard
          mission('08:00', '12:00', 'a4'), // absence validée
        ],
      });
      const team = await service.team(SUPERVISOR, NOW);
      expect(team.map((a) => [a.id, a.today.status])).toEqual([
        ['a1', 'ON_SITE'],
        ['a2', 'LATE'],
        ['a3', 'PLANNED'],
        ['a4', 'ABSENT'],
        ['a5', 'OFF'],
      ]);
      expect(team[0]).toEqual(expect.objectContaining({ phone: '06a1', expiringCertifications: 2 }));
      // Seuls les agents du périmètre sont demandés.
      expect(prisma.user.findMany.mock.calls[0][0].where.id).toEqual({ in: ['a1', 'a2', 'a3', 'a4'] });
    });

    it("n'est pas en retard pendant la tolérance, et a fini sa journée une fois reparti", async () => {
      const { service } = build({
        agents: ['a1', 'a2'].map(agent),
        dayMissions: [
          mission('09:55', '12:00', 'a1'), // tolérance jusqu'à 10:05
          mission('06:00', '09:00', 'a2', { in: checkIn, out: new Date('2026-09-29T07:00:00.000Z') }, 'COMPLETED'),
        ],
      });
      const team = await service.team(SUPERVISOR, NOW);
      expect(team.map((a) => a.today.status)).toEqual(['PLANNED', 'DONE']);
    });

    it("renvoie une liste vide à un superviseur sans agent", async () => {
      const { service, prisma } = build({ scopeAgents: [] });
      expect(await service.team(SUPERVISOR, NOW)).toEqual([]);
      expect(prisma.user.findMany.mock.calls[0][0].where.id).toEqual({ in: [] });
    });
  });

  describe('agentFile', () => {
    it("refuse la fiche d'un agent hors périmètre", async () => {
      const { service } = build({ agents: [{ ...agent('zz'), role: 'AGENT', active: true, certifications: [] }] });
      await expect(service.agentFile(SUPERVISOR, 'zz', NOW)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("compte les heures prévues et pointées de la semaine et du mois", async () => {
      const done = (date: string, start: string, end: string, inAt?: string, outAt?: string) => ({
        intervention: {
          date: new Date(`${date}T00:00:00.000Z`),
          startTime: start,
          endTime: end,
          attendances: inAt ? [{ checkInTime: new Date(inAt), checkOutTime: outAt ? new Date(outAt) : null }] : [],
        },
      });
      const { service } = build({
        agents: [{ ...agent('a1'), role: 'AGENT', active: true, certifications: [] }],
        assignments: [
          done('2026-09-28', '08:00', '11:00', '2026-09-28T06:00:00Z', '2026-09-28T08:30:00Z'), // lundi : 3 h prévues, 2 h 30 pointées
          done('2026-09-29', '22:00', '02:00'), // nuit : 4 h prévues
          done('2026-09-02', '08:00', '10:00', '2026-09-02T06:00:00Z', '2026-09-02T08:00:00Z'), // mois seulement
        ],
      });
      const file = await service.agentFile(SUPERVISOR, 'a1', NOW);
      expect(file.hours).toEqual({ week: { planned: 420, worked: 150 }, month: { planned: 540, worked: 270 } });
    });
  });

  describe('siteFile', () => {
    it("refuse la fiche d'un site qui n'est pas au superviseur", async () => {
      const { service } = build({});
      await expect(service.siteFile(SUPERVISOR, 'site-b', NOW)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
