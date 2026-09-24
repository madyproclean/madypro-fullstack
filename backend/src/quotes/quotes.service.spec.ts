import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuotesService } from './quotes.service';

/**
 * Couvre la state machine de statut (`QUOTE_TRANSITIONS`) — avant son ajout
 * (campagne QA), des transitions absurdes comme ACCEPTED→DRAFT ou PAID→DRAFT
 * étaient possibles.
 */
describe('QuotesService — transitions de statut', () => {
  const buildService = (existingStatus: string) => {
    const quoteRow = { id: 'quote-1', status: existingStatus, lineItems: [] };
    const prisma = {
      quote: {
        findUnique: jest.fn().mockResolvedValue(quoteRow),
        update: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ ...quoteRow, ...data, lineItems: [] }),
        ),
      },
    };
    const audit = { record: jest.fn() };
    // Dépendances non sollicitées par setStatus() — stubs vides suffisent.
    const numbering = {};
    const pdf = {};
    const settings = {};
    const mailer = {};
    const invoices = {};

    const service = new QuotesService(
      prisma as any,
      numbering as any,
      pdf as any,
      settings as any,
      mailer as any,
      audit as any,
      invoices as any,
    );
    return { service, prisma };
  };

  it('autorise DRAFT → SENT', async () => {
    const { service, prisma } = buildService('DRAFT');
    const result = await service.setStatus('quote-1', 'SENT' as any, 'actor-1');
    expect(result.status).toBe('SENT');
    expect(prisma.quote.update).toHaveBeenCalledTimes(1);
  });

  it('refuse ACCEPTED → DRAFT (retour en arrière après décision client)', async () => {
    const { service, prisma } = buildService('ACCEPTED');
    await expect(service.setStatus('quote-1', 'DRAFT' as any, 'actor-1')).rejects.toThrow(BadRequestException);
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it('refuse toute transition depuis CANCELLED (état terminal)', async () => {
    const { service, prisma } = buildService('CANCELLED');
    await expect(service.setStatus('quote-1', 'SENT' as any, 'actor-1')).rejects.toThrow(BadRequestException);
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it('lève une 404 si le devis n’existe pas', async () => {
    const { service } = buildService('DRAFT');
    (service as any).prisma = { quote: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(service.setStatus('missing', 'SENT' as any, 'actor-1')).rejects.toThrow(NotFoundException);
  });
});
