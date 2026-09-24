import { BadRequestException } from '@nestjs/common';
import { AbsencesService } from './absences.service';

/**
 * Couvre la règle de chevauchement (`checkOverlap`), exercée via `request()` —
 * un des bugs corrigés pendant la campagne QA (le chevauchement n'était pas
 * vérifié du tout avant, une même période pouvait être demandée deux fois).
 */
describe('AbsencesService — chevauchement de dates', () => {
  const AGENT = { id: 'user-1', name: 'Agent Test' };

  const buildService = (overrides: { existingAbsence?: unknown; blockedPeriod?: unknown } = {}) => {
    const prisma = {
      absence: {
        findFirst: jest.fn().mockResolvedValue(overrides.existingAbsence ?? null),
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: 'absence-1',
            ...data,
          }),
        ),
      },
      blockedPeriod: {
        findFirst: jest.fn().mockResolvedValue(overrides.blockedPeriod ?? null),
      },
    };
    const usersService = { findOne: jest.fn().mockReturnValue(AGENT) };
    const sitesService = { findOne: jest.fn().mockReturnValue(null) };
    const auditService = { record: jest.fn() };
    const notifications = { notifyRole: jest.fn(), notifyUser: jest.fn() };

    const service = new AbsencesService(
      prisma as any,
      usersService as any,
      sitesService as any,
      auditService as any,
      notifications as any,
    );
    return { service, prisma };
  };

  it('rejette une demande qui chevauche une absence existante du même agent', async () => {
    const { service } = buildService({
      existingAbsence: {
        id: 'absence-existing',
        from: new Date('2026-06-10T00:00:00.000Z'),
        to: new Date('2026-06-12T00:00:00.000Z'),
      },
    });

    await expect(
      service.request({
        userId: AGENT.id,
        type: 'SICK',
        from: '2026-06-11',
        to: '2026-06-13',
        reason: 'Grippe',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it("accepte une demande sur une période libre et l'auto-approuve si ≤ 2 jours", async () => {
    const { service, prisma } = buildService({ existingAbsence: null });

    const result = await service.request({
      userId: AGENT.id,
      type: 'SICK',
      from: '2026-06-11',
      to: '2026-06-12',
      reason: 'Grippe',
    } as any);

    expect(prisma.absence.create).toHaveBeenCalledTimes(1);
    expect(prisma.absence.create.mock.calls[0][0].data.status).toBe('APPROVED');
    expect(result.status).toBe('APPROVED');
  });

  it('rejette une demande posée sur une période bloquée, même sans chevauchement d’absence', async () => {
    const { service } = buildService({
      existingAbsence: null,
      blockedPeriod: {
        id: 'blocked-1',
        from: new Date('2026-12-20T00:00:00.000Z'),
        to: new Date('2027-01-02T00:00:00.000Z'),
        reason: 'Forte activité fêtes',
      },
    });

    await expect(
      service.request({
        userId: AGENT.id,
        type: 'SICK',
        from: '2026-12-24',
        to: '2026-12-26',
        reason: 'Grippe',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });
});
