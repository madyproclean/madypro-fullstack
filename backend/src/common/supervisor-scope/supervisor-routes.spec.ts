import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Inventaire des routes accessibles à un SUPERVISEUR. Toute route nouvelle (ou dont les rôles
 * changent) fait échouer ce test tant qu'elle n'est pas classée ci-dessous, ce qui oblige à
 * décider comment elle est limitée au périmètre du superviseur :
 * - `perimetre` : filtrée ou vérifiée via SupervisorScopeService (ses sites / ses agents) ;
 * - `soi`       : n'agit que sur les données de l'appelant ;
 * - `commun`    : référentiel commun à l'entreprise, sans donnée d'un site ou d'un agent ;
 * - `jeton`     : hors JWT, protégée par un jeton dédié.
 * Les tests HTTP (supervisor-scope.http.spec.ts) vérifient le comportement des cas `perimetre`.
 */
type Protection = 'perimetre' | 'soi' | 'commun' | 'jeton';

const SUPERVISOR_ROUTES: Record<string, Protection> = {
  'DELETE /availability/:id': 'soi',
  'DELETE /badges/awards/:id': 'perimetre',
  'DELETE /certifications/:id': 'perimetre',
  'DELETE /employee-documents/:id': 'perimetre',
  'DELETE /forms/:id': 'commun',
  'DELETE /inventory/:id': 'perimetre',
  'DELETE /sites/:id/categories/:siteCategoryId': 'perimetre',
  'DELETE /sites/:id/categories/:siteCategoryId/checklist/:itemId': 'perimetre',
  'DELETE /sites/:id/contracts/:contractId': 'perimetre',
  'DELETE /sites/:id/zones/:zoneId': 'perimetre',
  'DELETE /team-feed/:id': 'soi',
  'GET /absences': 'perimetre',
  'GET /absences/blocked-periods/list': 'commun',
  'GET /absences/:id': 'perimetre',
  'GET /absences/:id/replacement-suggestions': 'perimetre',
  'GET /approval-requests/mine': 'soi',
  'GET /absences/leave-balance/:userId': 'perimetre',
  'GET /anomalies/:interventionId': 'perimetre',
  'GET /attendance': 'perimetre',
  'GET /attendance/anomalies': 'perimetre',
  'GET /attendance/:id': 'perimetre',
  'GET /attendance/live-map': 'perimetre',
  'GET /availability': 'perimetre',
  'GET /availability/me': 'soi',
  'GET /badges': 'commun',
  'GET /badges/awards': 'perimetre',
  'GET /categories': 'commun',
  'GET /certifications': 'perimetre',
  'GET /certifications/expiring': 'perimetre',
  'GET /chat/threads': 'perimetre',
  'GET /chat/threads/me': 'soi',
  'GET /chat/threads/:userId': 'perimetre',
  'GET /employee-documents': 'perimetre',
  'GET /forms': 'commun',
  'GET /forms/:id/submissions': 'perimetre',
  'GET /interventions': 'perimetre',
  'GET /interventions/estimate-duration': 'perimetre',
  'GET /interventions/:id': 'perimetre',
  'GET /interventions/:id/assignment-suggestions': 'perimetre',
  'GET /interventions/:id/checklist': 'perimetre',
  'GET /interventions/next': 'soi',
  'GET /interventions/planning': 'perimetre',
  'GET /interventions/route-optimization': 'perimetre',
  'GET /interventions/site-roster/:siteId': 'perimetre',
  'GET /interventions/templates/agent-suggestions': 'perimetre',
  'GET /interventions/templates/:id': 'perimetre',
  'GET /interventions/templates/:id/preview': 'perimetre',
  'GET /interventions/templates/list': 'perimetre',
  'GET /inventory': 'perimetre',
  'GET /inventory/barcode/:barcode': 'perimetre',
  'GET /inventory/low-stock': 'perimetre',
  'GET /notifications': 'perimetre',
  'GET /notifications/feed': 'perimetre',
  'GET /notifications/:id/read-stats': 'perimetre',
  'GET /notifications/templates/list': 'commun',
  'GET /onboarding/template': 'commun',
  'GET /onboarding/users/:userId': 'perimetre',
  'GET /public-api/portal/:token': 'jeton',
  'GET /public-api/portal/:token/incidents': 'jeton',
  'GET /realtime/stream': 'perimetre',
  'GET /reports/hours-quota': 'perimetre',
  'GET /reports/hours-quota/pdf': 'perimetre',
  'GET /reports/site-dossier': 'perimetre',
  'GET /reports/site-dossier/pdf': 'perimetre',
  'GET /shift-swaps': 'perimetre',
  'GET /shift-swaps/colleagues': 'soi',
  'GET /sites': 'perimetre',
  'GET /supervision/agents': 'perimetre',
  'GET /supervision/agents/:id': 'perimetre',
  'GET /supervision/sites/:id': 'perimetre',
  'GET /supervision/today': 'perimetre',
  'GET /interventions/me/month-summary': 'soi',
  'GET /interventions/my-planning': 'soi',
  'GET /interventions/templates/:id/pauses': 'perimetre',
  'POST /interventions/templates/:id/duplicate': 'perimetre',
  'GET /inventory/:id/movements': 'perimetre',
  'GET /public-api/portal/:token/report.pdf': 'jeton',
  'GET /reports/client-report/pdf': 'perimetre',
  'GET /supervision/steering': 'perimetre',
  'GET /supervision/day-summary': 'perimetre',
  'GET /supervision/quality': 'perimetre',
  'GET /supervision/sites/:id/history': 'perimetre',
  'GET /supervision/sites/:id/inspections': 'perimetre',
  'POST /supervision/sites/:id/inspections': 'perimetre',
  'POST /attendance/:id/regularize': 'perimetre',
  'POST /chat/sites/:siteId/broadcast': 'perimetre',
  'POST /interventions/validate-batch': 'perimetre',
  'GET /sites/contracts/expiring': 'perimetre',
  'GET /sites/:id': 'perimetre',
  'GET /sites/:id/categories': 'perimetre',
  'GET /sites/:id/contracts': 'perimetre',
  'GET /sites/:id/incidents': 'perimetre',
  'GET /sites/:id/qr-code': 'perimetre',
  'GET /sites/:id/quality-score': 'perimetre',
  'GET /sites/:id/zones': 'perimetre',
  'GET /team-feed': 'commun',
  'GET /users': 'perimetre',
  'GET /users/:id': 'perimetre',
  'PATCH /absences/:id/status': 'perimetre',
  'PATCH /anomalies/:id/status': 'perimetre',
  'PATCH /attendance/:id': 'perimetre',
  'PATCH /attendance/:id/cancel': 'perimetre',
  'PATCH /certifications/:id': 'perimetre',
  'PATCH /chat/threads/me/read': 'soi',
  'PATCH /chat/threads/:userId/read': 'perimetre',
  'PATCH /interventions/:id': 'perimetre',
  'PATCH /interventions/:id/checklist/:itemId': 'perimetre',
  'PATCH /interventions/:id/status': 'perimetre',
  'PATCH /interventions/templates/:id': 'perimetre',
  'PATCH /interventions/templates/:id/toggle': 'perimetre',
  'PATCH /inventory/:id/adjust': 'perimetre',
  'PATCH /notifications/:id/read': 'soi',
  'PATCH /onboarding/items/:id': 'perimetre',
  'PATCH /sites/:id': 'perimetre',
  'PATCH /sites/:id/categories/:siteCategoryId': 'perimetre',
  'PATCH /sites/:id/categories/:siteCategoryId/checklist/:itemId': 'perimetre',
  'PATCH /sites/:id/plan': 'perimetre',
  'PATCH /sites/:id/zones/:zoneId': 'perimetre',
  'PATCH /users/:id': 'perimetre',
  'PATCH /users/:id/status': 'perimetre',
  'POST /absences/:id/approve-level1': 'perimetre',
  'POST /absences/manual': 'perimetre',
  'POST /absences/request': 'perimetre',
  'POST /anomalies': 'perimetre',
  'POST /attendance/arrival': 'soi',
  'POST /attendance/check-in': 'soi',
  'POST /attendance/check-out': 'soi',
  'POST /attendance/heartbeat': 'soi',
  'POST /attendance/manual': 'perimetre',
  'POST /availability': 'soi',
  'POST /badges': 'commun',
  'POST /badges/awards': 'perimetre',
  'POST /certifications': 'perimetre',
  'POST /chat/threads/me/messages': 'soi',
  'POST /chat/threads/:userId/messages': 'perimetre',
  'POST /employee-documents': 'perimetre',
  'POST /forms': 'commun',
  'POST /forms/:id/submissions': 'soi',
  'POST /interventions/:id/cancel': 'perimetre',
  'POST /interventions/:id/signature': 'perimetre',
  'POST /interventions/templates': 'perimetre',
  'POST /interventions/templates/:id/generate': 'perimetre',
  'POST /interventions/templates/impact': 'perimetre',
  'POST /interventions/templates/:id/impact': 'perimetre',
  'GET /interventions/templates/:id/revisions': 'perimetre',
  'GET /interventions/templates/:id/exceptions': 'perimetre',
  'POST /interventions/templates/:id/exceptions': 'perimetre',
  'DELETE /interventions/templates/:id/exceptions/:exceptionId': 'perimetre',
  'POST /inventory': 'perimetre',
  'POST /notifications': 'perimetre',
  'POST /notifications/register-token': 'soi',
  'POST /notifications/templates': 'commun',
  'POST /onboarding/users/:userId/seed': 'perimetre',
  'POST /shift-swaps': 'soi',
  'POST /shift-swaps/:id/accept': 'soi',
  'POST /shift-swaps/:id/cancel': 'soi',
  'POST /shift-swaps/:id/reject': 'soi',
  'POST /sites/:id/categories': 'perimetre',
  'POST /sites/:id/categories/:siteCategoryId/checklist': 'perimetre',
  'POST /sites/:id/contracts': 'perimetre',
  'POST /sites/:id/zones': 'perimetre',
  'POST /team-feed': 'soi',
  'POST /users': 'perimetre',
  'POST /users/:id/reset-password': 'perimetre',
};

/** Routes que le superviseur NE doit PAS atteindre (décisions produit du sprint 0). */
const ADMIN_ONLY = [
  'GET /audit',
  'GET /quotes',
  'POST /quotes',
  'GET /invoices',
  'POST /invoices',
  'POST /sites',
  'DELETE /sites/:id',
  'GET /assignments',
  'GET /approval-requests',
  'PATCH /users/:id/permissions',
];

// Le module d'authentification (connexion, mot de passe, 2FA) agit par définition sur l'appelant ;
// il est exclu car sa dépendance otplib (ESM) ne se charge pas sous Jest.
const EXCLUDED_CONTROLLERS = ['auth.controller.ts'];

type Route = { key: string; roles: string[] | undefined; guards: string[] };

function collectRoutes(): Route[] {
  const srcRoot = path.join(__dirname, '..', '..');
  const files = fs.readdirSync(srcRoot).flatMap((dir) => {
    const full = path.join(srcRoot, dir);
    if (!fs.statSync(full).isDirectory()) return [];
    return fs
      .readdirSync(full)
      .filter((f) => f.endsWith('.controller.ts') && !EXCLUDED_CONTROLLERS.includes(f))
      .map((f) => path.join(full, f));
  });
  const routes: Route[] = [];
  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file);
    for (const ctrl of Object.values(mod) as any[]) {
      if (typeof ctrl !== 'function' || Reflect.getMetadata(PATH_METADATA, ctrl) === undefined) continue;
      const base = Reflect.getMetadata(PATH_METADATA, ctrl) as string;
      for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
        const handler = ctrl.prototype[name];
        const routePath = Reflect.getMetadata(PATH_METADATA, handler);
        if (name === 'constructor' || routePath === undefined) continue;
        const verb = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
        const fullPath = `/${[base, routePath].filter(Boolean).join('/')}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
        routes.push({
          key: `${verb} ${fullPath}`,
          roles: Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, ctrl),
          guards: [
            ...(Reflect.getMetadata(GUARDS_METADATA, ctrl) ?? []),
            ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? []),
          ].map((g: any) => g.name),
        });
      }
    }
  }
  return routes;
}

describe('Routes accessibles au superviseur', () => {
  const routes = collectRoutes();
  const reachable = routes.filter((route) => {
    if (route.guards.some((g) => g === 'ApiKeyGuard' || g === 'PermissionsGuard')) return false;
    if (route.key === 'GET /health') return false;
    return !route.roles || route.roles.includes('SUPERVISOR');
  });

  it('sont toutes classées (nouvelle route → décider de sa protection)', () => {
    const unclassified = reachable.map((r) => r.key).filter((key) => !(key in SUPERVISOR_ROUTES));
    expect(unclassified).toEqual([]);
  });

  it("n'ont pas d'entrée obsolète dans l'inventaire", () => {
    const reachableKeys = new Set(reachable.map((r) => r.key));
    const stale = Object.keys(SUPERVISOR_ROUTES).filter((key) => !reachableKeys.has(key));
    expect(stale).toEqual([]);
  });

  it("n'incluent aucune route réservée à l'administrateur", () => {
    const byKey = new Map(routes.map((r) => [r.key, r]));
    for (const key of ADMIN_ONLY) {
      const route = byKey.get(key);
      expect({ key, exists: !!route }).toEqual({ key, exists: true });
      expect({ key, roles: route!.roles }).toEqual({ key, roles: ['ADMIN'] });
    }
  });

  it('protègent par une garde de périmètre toutes les routes /sites/:id et /interventions/:id', () => {
    const unguarded = reachable
      .filter((r) => /^\S+ \/(sites|interventions)\/:id/.test(r.key))
      .filter((r) => !r.guards.some((g) => g.startsWith('SupervisorScopeGuard(')))
      .map((r) => r.key);
    expect(unguarded).toEqual([]);
  });
});
