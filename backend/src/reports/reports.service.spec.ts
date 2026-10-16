import { ReportsService } from './reports.service';

/**
 * Couvre le calcul du quota d'heures mensuel + pénalité par agent (hoursQuota) :
 * taux d'accomplissement, franchissement du seuil, minutes de pénalité.
 * Jusqu'ici ce calcul n'était vérifié qu'à la main (recalcul manuel à partir
 * des pointages bruts) pendant les campagnes de QA.
 */
describe('ReportsService — quota d’heures et pénalité', () => {
  const SITE = { id: 'site-1', name: 'Site Test' };
  const AGENT = { id: 'agent-1', firstName: 'Jean', lastName: 'Dupont' };

  const buildService = (thresholdPercent: number) => {
    const intervention = {
      id: 'int-1',
      date: new Date('2026-06-05T00:00:00.000Z'),
      startTime: '08:00',
      endTime: '12:00', // 4h planifiées
      siteId: SITE.id,
      site: SITE,
      assignments: [{ userId: AGENT.id, user: AGENT }],
    };

    const prisma = {
      intervention: { findMany: jest.fn().mockResolvedValue([intervention]) },
      attendance: { findMany: jest.fn() },
      siteSupervisor: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const settingsService = {
      getSettings: () => ({ monthlyQuota: { accomplishmentThresholdPercent: thresholdPercent } }),
    };
    const mailer = {};
    const webhooksService = {};
    const documentPdfService = {};

    const service = new ReportsService(
      prisma as any,
      settingsService as any,
      mailer as any,
      webhooksService as any,
      documentPdfService as any,
    );
    return { service, prisma };
  };

  it('ne pénalise pas un agent qui atteint le seuil (réalisé ≥ seuil × planifié)', async () => {
    const { service, prisma } = buildService(80);
    // Réalisé : 08:00-11:12 = 3h12 = 80% de 4h planifiées → au seuil, pas de pénalité.
    prisma.attendance.findMany.mockResolvedValue([
      {
        userId: AGENT.id,
        user: AGENT,
        checkInTime: new Date('2026-06-05T08:00:00.000Z'),
        checkOutTime: new Date('2026-06-05T11:12:00.000Z'),
        intervention: { siteId: SITE.id, site: SITE },
      },
    ]);

    const result = await service.hoursQuota('2026-06-01', '2026-06-30');
    const agent = result.agentReports[0];

    expect(agent.plannedMinutes).toBe(240);
    expect(agent.realizedMinutes).toBe(192);
    expect(agent.accomplishmentRate).toBe(80);
    expect(agent.meetsQuota).toBe(true);
    expect(agent.penaltyMinutes).toBe(0);
  });

  it('pénalise un agent sous le seuil, avec les bonnes minutes de pénalité', async () => {
    const { service, prisma } = buildService(80);
    // Réalisé : 08:00-10:00 = 2h = 50% de 4h planifiées → sous le seuil de 80%.
    prisma.attendance.findMany.mockResolvedValue([
      {
        userId: AGENT.id,
        user: AGENT,
        checkInTime: new Date('2026-06-05T08:00:00.000Z'),
        checkOutTime: new Date('2026-06-05T10:00:00.000Z'),
        intervention: { siteId: SITE.id, site: SITE },
      },
    ]);

    const result = await service.hoursQuota('2026-06-01', '2026-06-30');
    const agent = result.agentReports[0];

    expect(agent.plannedMinutes).toBe(240);
    expect(agent.realizedMinutes).toBe(120);
    expect(agent.accomplishmentRate).toBe(50);
    expect(agent.meetsQuota).toBe(false);
    expect(agent.penaltyMinutes).toBe(120); // 240 planifiées - 120 réalisées
  });

  it('n’applique aucune pénalité si aucune heure n’était planifiée (division par zéro évitée)', async () => {
    const { service, prisma } = buildService(80);
    prisma.intervention.findMany.mockResolvedValue([]);
    prisma.attendance.findMany.mockResolvedValue([]);

    const result = await service.hoursQuota('2026-06-01', '2026-06-30');
    expect(result.agentReports).toHaveLength(0);
  });
});

/**
 * Couvre l'export paie (`payrollCsv`) : agrégation des pointages par agent et
 * par semaine ISO, avec le seuil légal de 35h/semaine (heures normales vs
 * majorées). Jusqu'ici uniquement vérifié à la main.
 */
describe('ReportsService — export paie (heures normales / majorées)', () => {
  const AGENT = { id: 'agent-1', firstName: 'Jean', lastName: 'Dupont', email: 'jean.dupont@example.com' };

  const buildService = (attendances: unknown[]) => {
    const prisma = {
      attendance: { findMany: jest.fn().mockResolvedValue(attendances) },
    };
    const service = new ReportsService(prisma as any, {} as any, {} as any, {} as any, {} as any);
    return { service, prisma };
  };

  const attendance = (checkIn: string, checkOut: string) => ({
    userId: AGENT.id,
    user: AGENT,
    date: new Date(checkIn),
    checkInTime: new Date(checkIn),
    checkOutTime: new Date(checkOut),
  });

  it('reste entièrement en heures normales sous 35h dans la semaine', async () => {
    const { service } = buildService([
      // Lundi 2026-06-01, 8h de travail — bien sous le seuil hebdo.
      attendance('2026-06-01T08:00:00.000Z', '2026-06-01T16:00:00.000Z'),
    ]);
    const csv = await service.payrollCsv('2026-06-01', '2026-06-07');
    const [, row] = csv.split('\n');
    const [, , , normalHours, overtimeHours, totalHours] = row.split(';');
    expect(normalHours).toBe('8.00');
    expect(overtimeHours).toBe('0.00');
    expect(totalHours).toBe('8.00');
  });

  it('bascule en heures majorées au-delà de 35h cumulées sur la même semaine ISO', async () => {
    const { service } = buildService([
      // Même semaine ISO (lundi 01/06 → vendredi 05/06) : 5 × 8h = 40h.
      attendance('2026-06-01T08:00:00.000Z', '2026-06-01T16:00:00.000Z'),
      attendance('2026-06-02T08:00:00.000Z', '2026-06-02T16:00:00.000Z'),
      attendance('2026-06-03T08:00:00.000Z', '2026-06-03T16:00:00.000Z'),
      attendance('2026-06-04T08:00:00.000Z', '2026-06-04T16:00:00.000Z'),
      attendance('2026-06-05T08:00:00.000Z', '2026-06-05T16:00:00.000Z'),
    ]);
    const csv = await service.payrollCsv('2026-06-01', '2026-06-07');
    const rows = csv.split('\n');
    expect(rows).toHaveLength(2); // en-tête + une seule ligne (une semaine)
    const [, , , normalHours, overtimeHours, totalHours] = rows[1].split(';');
    expect(normalHours).toBe('35.00');
    expect(overtimeHours).toBe('5.00');
    expect(totalHours).toBe('40.00');
  });

  it('sépare les heures sur deux lignes distinctes quand elles tombent sur deux semaines ISO différentes', async () => {
    const { service } = buildService([
      attendance('2026-06-01T08:00:00.000Z', '2026-06-01T16:00:00.000Z'), // semaine du 1er juin
      attendance('2026-06-10T08:00:00.000Z', '2026-06-10T16:00:00.000Z'), // semaine suivante
    ]);
    const csv = await service.payrollCsv('2026-06-01', '2026-06-15');
    const rows = csv.split('\n');
    expect(rows).toHaveLength(3); // en-tête + 2 semaines distinctes
    const weeks = rows.slice(1).map((r) => r.split(';')[2]);
    expect(new Set(weeks).size).toBe(2);
  });
});
