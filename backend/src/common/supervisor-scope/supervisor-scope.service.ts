import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export type Viewer = { id?: string; sub?: string; userId?: string; role?: string } | undefined | null;

/**
 * Périmètre d'un superviseur, calculé côté serveur :
 * - ses sites = ceux où il est déclaré superviseur (`SiteSupervisor`) ;
 * - ses agents = ceux déjà affectés à au moins une intervention sur l'un de ses sites
 *   (aucune fenêtre de dates : un superviseur ne perd pas l'accès à l'historique).
 *
 * Toutes les méthodes renvoient `null` / laissent passer pour un non-superviseur :
 * l'admin n'est jamais restreint, et les règles propres à l'agent restent dans chaque service.
 */
@Injectable()
export class SupervisorScopeService {
  constructor(private readonly prisma: PrismaService) {}

  static viewerId(viewer: Viewer): string {
    return viewer?.id ?? viewer?.sub ?? viewer?.userId ?? '';
  }

  static isSupervisor(viewer: Viewer): boolean {
    return viewer?.role?.toString().trim().toUpperCase() === 'SUPERVISOR';
  }

  /** Ids des sites supervisés, ou `null` si le demandeur n'est pas superviseur. */
  async siteIds(viewer: Viewer): Promise<string[] | null> {
    if (!SupervisorScopeService.isSupervisor(viewer)) return null;
    const links = await this.prisma.siteSupervisor.findMany({
      where: { userId: SupervisorScopeService.viewerId(viewer) },
      select: { siteId: true },
    });
    return links.map((link) => link.siteId);
  }

  /** Ids des agents du périmètre, ou `null` si le demandeur n'est pas superviseur. */
  async agentIds(viewer: Viewer): Promise<Set<string> | null> {
    const siteIds = await this.siteIds(viewer);
    if (!siteIds) return null;
    if (!siteIds.length) return new Set();
    const assignments = await this.prisma.interventionAssignment.findMany({
      where: { intervention: { siteId: { in: siteIds } } },
      select: { userId: true },
      distinct: ['userId'],
    });
    return new Set(assignments.map((a) => a.userId));
  }

  async assertSite(viewer: Viewer, siteId: string | null | undefined) {
    const siteIds = await this.siteIds(viewer);
    if (siteIds && (!siteId || !siteIds.includes(siteId))) {
      throw new ForbiddenException("Vous n'avez pas la charge de ce site");
    }
  }

  async assertSites(viewer: Viewer, siteIds: Array<string | null | undefined>) {
    const allowed = await this.siteIds(viewer);
    if (allowed && siteIds.some((id) => !id || !allowed.includes(id))) {
      throw new ForbiddenException("Vous n'avez pas la charge de ce site");
    }
  }

  async assertIntervention(viewer: Viewer, interventionId: string) {
    if (!SupervisorScopeService.isSupervisor(viewer)) return;
    const intervention = await this.prisma.intervention.findUnique({
      where: { id: interventionId },
      select: { siteId: true },
    });
    if (!intervention) throw new NotFoundException('Intervention introuvable');
    await this.assertSite(viewer, intervention.siteId);
  }

  async assertAgent(viewer: Viewer, agentId: string | null | undefined) {
    const agentIds = await this.agentIds(viewer);
    if (agentIds && (!agentId || !agentIds.has(agentId))) {
      throw new ForbiddenException("Cet agent n'est pas dans votre périmètre de supervision");
    }
  }
}
