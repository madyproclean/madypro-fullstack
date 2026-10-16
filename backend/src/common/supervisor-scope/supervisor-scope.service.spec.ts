import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupervisorScopeService } from './supervisor-scope.service';

/**
 * Périmètre superviseur calculé côté serveur : ses sites (SiteSupervisor) et les agents déjà
 * affectés sur ces sites. L'admin n'est jamais restreint.
 */
describe('SupervisorScopeService', () => {
  const SUPERVISOR = { sub: 'sup-1', role: 'SUPERVISOR' };
  const ADMIN = { sub: 'admin-1', role: 'ADMIN' };

  const buildService = () => {
    const prisma = {
      siteSupervisor: {
        findMany: jest.fn().mockResolvedValue([{ siteId: 'site-a' }, { siteId: 'site-b' }]),
      },
      interventionAssignment: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'agent-1' }, { userId: 'agent-2' }]),
      },
      intervention: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(
            { 'int-a': { siteId: 'site-a' }, 'int-z': { siteId: 'site-z' } }[where.id as string] ?? null,
          ),
        ),
      },
    };
    return { service: new SupervisorScopeService(prisma as any), prisma };
  };

  it("ne restreint pas l'admin", async () => {
    const { service, prisma } = buildService();
    expect(await service.siteIds(ADMIN)).toBeNull();
    expect(await service.agentIds(ADMIN)).toBeNull();
    await expect(service.assertSite(ADMIN, 'site-z')).resolves.toBeUndefined();
    await expect(service.assertIntervention(ADMIN, 'int-z')).resolves.toBeUndefined();
    expect(prisma.siteSupervisor.findMany).not.toHaveBeenCalled();
  });

  it('renvoie les sites supervisés, lus via le compte du JWT (sub)', async () => {
    const { service, prisma } = buildService();
    expect(await service.siteIds(SUPERVISOR)).toEqual(['site-a', 'site-b']);
    expect(prisma.siteSupervisor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'sup-1' } }),
    );
  });

  it('renvoie les agents affectés sur ses sites', async () => {
    const { service, prisma } = buildService();
    expect(await service.agentIds(SUPERVISOR)).toEqual(new Set(['agent-1', 'agent-2']));
    expect(prisma.interventionAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { intervention: { siteId: { in: ['site-a', 'site-b'] } } } }),
    );
  });

  it("n'a aucun agent quand il n'a aucun site", async () => {
    const { service, prisma } = buildService();
    prisma.siteSupervisor.findMany.mockResolvedValue([]);
    expect(await service.agentIds(SUPERVISOR)).toEqual(new Set());
    expect(prisma.interventionAssignment.findMany).not.toHaveBeenCalled();
  });

  it('autorise un de ses sites et refuse un autre site ou un site absent', async () => {
    const { service } = buildService();
    await expect(service.assertSite(SUPERVISOR, 'site-a')).resolves.toBeUndefined();
    await expect(service.assertSite(SUPERVISOR, 'site-z')).rejects.toThrow(ForbiddenException);
    await expect(service.assertSite(SUPERVISOR, undefined)).rejects.toThrow(ForbiddenException);
    await expect(service.assertSites(SUPERVISOR, ['site-a', 'site-z'])).rejects.toThrow(ForbiddenException);
  });

  it("vérifie une intervention par le site qui la porte", async () => {
    const { service } = buildService();
    await expect(service.assertIntervention(SUPERVISOR, 'int-a')).resolves.toBeUndefined();
    await expect(service.assertIntervention(SUPERVISOR, 'int-z')).rejects.toThrow(ForbiddenException);
    await expect(service.assertIntervention(SUPERVISOR, 'int-inconnue')).rejects.toThrow(NotFoundException);
  });

  it('autorise un agent de son équipe et refuse les autres', async () => {
    const { service } = buildService();
    await expect(service.assertAgent(SUPERVISOR, 'agent-1')).resolves.toBeUndefined();
    await expect(service.assertAgent(SUPERVISOR, 'agent-9')).rejects.toThrow(ForbiddenException);
  });
});
