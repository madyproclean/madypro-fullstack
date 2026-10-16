import { InboxService } from './inbox.service';

describe('file « à traiter » de l’administrateur', () => {
  it('rassemble les éléments et met les plus urgents en tête', async () => {
    const now = new Date('2026-10-16T08:00:00Z');
    const prisma: any = {
      absence: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'ab1', from: new Date('2026-10-17'), to: new Date('2026-10-20'), requiresSecondApproval: false, level1ApprovedBy: null, createdAt: new Date('2026-10-15'), user: { firstName: 'Tino', lastName: 'K' } },
        ]),
      },
      anomaly: { findMany: jest.fn().mockResolvedValue([]) },
      intervention: { findMany: jest.fn().mockResolvedValue([{ id: 'm1', date: new Date('2026-10-14'), startTime: '06:00', endTime: '08:00', site: { name: 'Maida' } }]) },
      inventoryItem: { findMany: jest.fn().mockResolvedValue([{ id: 'i1', name: 'Dégraissant', quantity: 0, minThreshold: 2, unit: 'bidon', updatedAt: now, site: { name: 'Bofinger' } }]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      certification: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const approvals: any = {
      list: jest.fn().mockResolvedValue({ items: [{ id: 'r1', actionType: 'VALIDATE_TEMPLATE', summary: 'Petit Plisson', requestedByName: 'Serge Konan', createdAt: new Date('2026-10-15') }] }),
    };
    const result = await new InboxService(prisma, approvals).list(now);
    expect(result.total).toBe(4);
    expect(result.items.map((i) => i.kind)).toEqual(['ABSENCE', 'LOW_STOCK', 'APPROVAL', 'MISSION_TO_VALIDATE']);
    expect(result.items[0]).toEqual(expect.objectContaining({ urgency: 'HIGH', link: '/absences/ab1' }));
    expect(result.high).toBe(2);
  });
});
