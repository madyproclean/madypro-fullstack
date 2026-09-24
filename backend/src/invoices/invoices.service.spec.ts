import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';

/**
 * Couvre la state machine de statut (`INVOICE_TRANSITIONS`) et la garde de
 * `recordPayment` — avant leur ajout (campagne QA), PAID→DRAFT était possible
 * et un paiement partiel pouvait laisser une facture PAID avec un solde non
 * soldé ("PAID fantôme").
 */
describe('InvoicesService — transitions de statut et paiement', () => {
  const buildService = (existingStatus: string, extra: Record<string, unknown> = {}) => {
    const invoiceRow = { id: 'invoice-1', status: existingStatus, lineItems: [], ...extra };
    const prisma = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue(invoiceRow),
        update: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ ...invoiceRow, ...data, lineItems: invoiceRow.lineItems }),
        ),
      },
    };
    const audit = { record: jest.fn() };
    const numbering = {};
    const pdf = {};
    const settings = {};
    const mailer = {};
    const usersService = {};
    const notifications = {};

    const service = new InvoicesService(
      prisma as any,
      numbering as any,
      pdf as any,
      settings as any,
      mailer as any,
      audit as any,
      usersService as any,
      notifications as any,
    );
    return { service, prisma };
  };

  describe('setStatus', () => {
    it('autorise DRAFT → SENT', async () => {
      const { service, prisma } = buildService('DRAFT');
      const result = await service.setStatus('invoice-1', 'SENT' as any, 'actor-1');
      expect(result.status).toBe('SENT');
      expect(prisma.invoice.update).toHaveBeenCalledTimes(1);
    });

    it('refuse PAID → DRAFT (PAID est un état terminal, pas de mécanisme d’avoir)', async () => {
      const { service, prisma } = buildService('PAID');
      await expect(service.setStatus('invoice-1', 'DRAFT' as any, 'actor-1')).rejects.toThrow(BadRequestException);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('refuse SENT → PAID via ce endpoint générique (seul recordPayment peut solder)', async () => {
      const { service, prisma } = buildService('SENT');
      await expect(service.setStatus('invoice-1', 'PAID' as any, 'actor-1')).rejects.toThrow(BadRequestException);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('lève une 404 si la facture n’existe pas', async () => {
      const { service } = buildService('DRAFT');
      (service as any).prisma = { invoice: { findUnique: jest.fn().mockResolvedValue(null) } };
      await expect(service.setStatus('missing', 'SENT' as any, 'actor-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('recordPayment', () => {
    const lineItems = [{ quantity: 1, unitPriceHT: 100, vatRatePercent: 20 }]; // totalTTC = 120

    it('passe la facture à PAID quand le montant réglé couvre le total TTC', async () => {
      const { service, prisma } = buildService('SENT', { lineItems });
      const result = await service.recordPayment(
        'invoice-1',
        { amountPaidHT: 120, paymentMethod: 'VIREMENT' } as any,
        'actor-1',
      );
      expect(result.status).toBe('PAID');
      expect(prisma.invoice.update.mock.calls[0][0].data.status).toBe('PAID');
      expect(prisma.invoice.update.mock.calls[0][0].data.paidAt).not.toBeNull();
    });

    it('repasse (ou reste) en SENT — jamais PAID — pour un paiement partiel', async () => {
      const { service, prisma } = buildService('SENT', { lineItems });
      const result = await service.recordPayment(
        'invoice-1',
        { amountPaidHT: 50, paymentMethod: 'VIREMENT' } as any,
        'actor-1',
      );
      expect(result.status).toBe('SENT');
      expect(prisma.invoice.update.mock.calls[0][0].data.paidAt).toBeNull();
    });

    it('refuse un paiement sur une facture en brouillon', async () => {
      const { service } = buildService('DRAFT', { lineItems });
      await expect(
        service.recordPayment('invoice-1', { amountPaidHT: 120 } as any, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuse un paiement sur une facture déjà annulée', async () => {
      const { service } = buildService('CANCELLED', { lineItems });
      await expect(
        service.recordPayment('invoice-1', { amountPaidHT: 120 } as any, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
