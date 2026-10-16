import { applyTemplateExceptions } from './recurrence.util';
import { checkAttendanceCompleteness } from './attendance-completeness.util';
import { InterventionsService } from './interventions.service';

const stop = {
  id: 'stop-1',
  daysOfWeek: [1, 2, 3, 4, 5],
  intervalWeeks: 1,
  specificDate: null,
  categoryId: null,
  startTime: '06:00',
  endTime: '08:00',
  agentIds: ['agent-a'],
  order: 0,
};

function buildService(validatedAt: Date | null) {
  const existing = {
    id: 'tpl-1',
    label: 'Gabarit A',
    siteId: 'site-a',
    startDate: new Date('2026-10-01T00:00:00Z'),
    endDate: null,
    active: true,
    validatedAt,
    validatedById: validatedAt ? 'admin' : null,
    pendingVersion: null,
    pendingRequestedById: null,
    pendingRequestedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    stops: [stop],
    site: { id: 'site-a', name: 'Site A' },
  };
  const prisma: any = {
    interventionTemplate: {
      findUnique: jest.fn().mockResolvedValue(existing),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data })),
    },
    templateStop: { update: jest.fn(), create: jest.fn(), delete: jest.fn() },
    templateRevision: { create: jest.fn() },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  const approvals = { createRequest: jest.fn(), supersedePending: jest.fn() };
  const users = { findOne: () => ({ name: 'Serge' }) };
  const service = new InterventionsService(
    prisma,
    {} as any,
    users as any,
    {} as any,
    {} as any,
    { get: () => undefined } as any,
    { record: jest.fn() } as any,
    approvals as any,
  );
  (service as any).generateImminentInterventionsFromTemplates = jest.fn();
  return { service, prisma, approvals };
}

describe('version d’un gabarit en attente de validation', () => {
  const change = { stops: [{ ...stop, specificDate: undefined, categoryId: undefined, startTime: '07:00', endTime: '09:00' }] };

  it('garde la version validée active et met la modification du superviseur de côté', async () => {
    const { service, prisma, approvals } = buildService(new Date('2026-10-02'));
    const result = await service.updateTemplate('tpl-1', change, 'sup-1', 'SUPERVISOR');
    expect(prisma.templateStop.update).not.toHaveBeenCalled();
    const data = prisma.interventionTemplate.update.mock.calls[0][0].data;
    expect(data.validatedAt).toBeUndefined();
    expect(data.pendingVersion.stops[0].startTime).toBe('07:00');
    expect(approvals.createRequest).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'VALIDATE_TEMPLATE' }));
    expect(result.stops[0].startTime).toBe('06:00');
  });

  it('applique directement la modification d’un administrateur et l’ajoute à l’historique', async () => {
    const { service, prisma } = buildService(new Date('2026-10-02'));
    await service.updateTemplate('tpl-1', change, 'admin', 'ADMIN');
    expect(prisma.templateStop.update).toHaveBeenCalled();
    expect(prisma.templateRevision.create).toHaveBeenCalled();
  });

  it('un gabarit jamais validé reste modifiable directement (toujours « à valider »)', async () => {
    const { service, prisma } = buildService(null);
    await service.updateTemplate('tpl-1', change, 'sup-1', 'SUPERVISOR');
    expect(prisma.templateStop.update).toHaveBeenCalled();
    expect(prisma.interventionTemplate.update.mock.calls[0][0].data.validatedAt).toBeNull();
  });
});

describe('exceptions d’un jour sur un créneau', () => {
  const occurrences = [
    { date: '2026-10-19', stopId: 'stop-1', agentIds: ['agent-a'] },
    { date: '2026-10-20', stopId: 'stop-1', agentIds: ['agent-a'] },
    { date: '2026-10-21', stopId: 'stop-1', agentIds: ['agent-a'] },
  ];

  it('retire un jour annulé et remplace les agents d’un seul jour', () => {
    const result = applyTemplateExceptions(occurrences, [
      { stopId: 'stop-1', date: '2026-10-19', kind: 'CANCEL', agentIds: [] },
      { stopId: 'stop-1', date: '2026-10-20', kind: 'REPLACE_AGENTS', agentIds: ['agent-b'], reason: 'Absence' },
    ]);
    expect(result.map((o) => o.date)).toEqual(['2026-10-20', '2026-10-21']);
    expect(result[0].agentIds).toEqual(['agent-b']);
    expect(result[0].exception?.originalAgentIds).toEqual(['agent-a']);
    expect(result[1].agentIds).toEqual(['agent-a']);
  });
});

describe('validation d’une mission', () => {
  it('refuse quand un agent affecté n’a aucun pointage', () => {
    const done = { userId: 'a', checkInTime: new Date(), checkOutTime: new Date(), status: 'COMPLETED' };
    const result = checkAttendanceCompleteness(['a', 'b'], [done]);
    expect(result.complete).toBe(false);
    expect(result.missingStart).toEqual(['b']);
    expect(checkAttendanceCompleteness(['a'], [done]).complete).toBe(true);
  });
});
