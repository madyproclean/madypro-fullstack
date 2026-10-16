import { InvoicesService } from './invoices.service';

describe('facture du mois préparée depuis les missions', () => {
  it('regroupe les passages réalisés par prestation, au prix du site, en brouillon', async () => {
    const prisma: any = {
      site: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'site-a',
          name: 'Bofinger',
          address: '5 rue de la Bastille',
          contactName: 'M. Dupont',
          contactEmail: 'client@example.test',
          categories: [
            { categoryId: 'cuisine', unitPriceHT: 85, category: { label: 'Nettoyage cuisine' } },
            { categoryId: 'vitres', unitPriceHT: null, category: { label: 'Vitres' } },
          ],
        }),
      },
      intervention: {
        findMany: jest.fn().mockResolvedValue([
          { categoryId: 'cuisine', subType: null },
          { categoryId: 'cuisine', subType: null },
          { categoryId: 'vitres', subType: null },
        ]),
      },
    };
    const service = new InvoicesService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const create = jest.spyOn(service, 'create').mockResolvedValue({ id: 'inv' } as any);
    await service.draftFromMissions('site-a', '2026-10', 'admin');

    const where = prisma.intervention.findMany.mock.calls[0][0].where;
    expect(where).toEqual(expect.objectContaining({ siteId: 'site-a', billable: true, status: { in: ['COMPLETED', 'NEEDS_REVIEW'] } }));
    const dto = create.mock.calls[0][0];
    expect(dto.clientName).toBe('M. Dupont');
    expect(dto.lineItems).toEqual([
      expect.objectContaining({ quantity: 2, unitPriceHT: 85, description: expect.stringContaining('Nettoyage cuisine — 2 passages') }),
      expect.objectContaining({ quantity: 1, unitPriceHT: 0 }),
    ]);
    expect(dto.notes).toContain('Prix à compléter pour : Vitres');
  });

  it('refuse un mois sans passage réalisé', async () => {
    const prisma: any = {
      site: { findUnique: jest.fn().mockResolvedValue({ id: 'site-a', name: 'A', address: '', categories: [] }) },
      intervention: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new InvoicesService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await expect(service.draftFromMissions('site-a', '2026-10', 'admin')).rejects.toThrow('Aucun passage facturable');
  });
});
