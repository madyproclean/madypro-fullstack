import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
      { agentIds: jest.fn().mockResolvedValue(null) } as any,
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

describe('AbsencesService — absence longue à double validation', () => {
  const LONG = {
    id: 'absence-long',
    userId: 'user-1',
    status: 'PENDING',
    requiresSecondApproval: true,
    level1ApprovedBy: 'sup-1',
    from: new Date('2026-10-08T00:00:00.000Z'),
    to: new Date('2026-10-15T00:00:00.000Z'),
  };

  const buildService = () => {
    const prisma = {
      absence: {
        findUnique: jest.fn().mockResolvedValue(LONG),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...LONG, ...data })),
      },
    };
    const service = new AbsencesService(
      prisma as any,
      { findOne: jest.fn().mockReturnValue({ id: 'user-1', name: 'Agent Test' }) } as any,
      { findOne: jest.fn().mockReturnValue(null) } as any,
      { record: jest.fn() } as any,
      { notifyRole: jest.fn(), notifyUser: jest.fn(), send: jest.fn() } as any,
      { agentIds: jest.fn().mockImplementation((v: any) => Promise.resolve(v?.role === 'SUPERVISOR' ? new Set(['user-1']) : null)) } as any,
    );
    return { service, prisma };
  };

  it("refuse l'accord final au superviseur, même après sa première validation", async () => {
    const { service, prisma } = buildService();
    await expect(
      service.updateStatus('absence-long', { status: 'APPROVED' } as any, { id: 'sup-1', role: 'SUPERVISOR' }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.absence.update).not.toHaveBeenCalled();
  });

  it('laisse le superviseur refuser une absence longue', async () => {
    const { service } = buildService();
    const result = await service.updateStatus('absence-long', { status: 'REJECTED', comment: 'Effectif insuffisant' } as any, {
      id: 'sup-1',
      role: 'SUPERVISOR',
    });
    expect(result.status).toBe('REJECTED');
  });

  it("accepte l'accord final de l'administrateur", async () => {
    const { service } = buildService();
    const result = await service.updateStatus('absence-long', { status: 'APPROVED' } as any, { id: 'admin-1', role: 'ADMIN' });
    expect(result.status).toBe('APPROVED');
  });
});
