import { CanActivate, ExecutionContext, Injectable, Type, mixin } from '@nestjs/common';
import { SupervisorScopeService } from './supervisor-scope.service';

type ScopeKind = 'site' | 'intervention' | 'agent';

/**
 * Garde de route : pour un superviseur, vérifie que le paramètre d'URL `param` (site, intervention
 * ou agent) est dans son périmètre ; 403 sinon. Sans effet pour les autres rôles.
 * À placer APRÈS `JwtAuthGuard` dans le même `@UseGuards` (l'utilisateur doit être chargé).
 */
export function SupervisorScopeGuard(kind: ScopeKind, param = 'id'): Type<CanActivate> {
  @Injectable()
  class ScopeGuard implements CanActivate {
    constructor(private readonly scope: SupervisorScopeService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const req = context.switchToHttp().getRequest();
      const viewer = req.user;
      if (!SupervisorScopeService.isSupervisor(viewer)) return true;
      const value = req.params?.[param];
      if (kind === 'site') await this.scope.assertSite(viewer, value);
      else if (kind === 'intervention') await this.scope.assertIntervention(viewer, value);
      else await this.scope.assertAgent(viewer, value);
      return true;
    }
  }
  const guard = mixin(ScopeGuard);
  // Nom lisible (le test d'inventaire des routes s'en sert pour reconnaître la garde).
  Object.defineProperty(guard, 'name', { value: `SupervisorScopeGuard(${kind}:${param})` });
  return guard;
}
