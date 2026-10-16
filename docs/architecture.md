# Architecture — mj-planning (Mady Proclean)

## Vue d'ensemble

```
                    ┌─────────────────┐
                    │   frontend/      │  React + Vite
                    │  (web admin/     │  Sert /dashboard, /sites, /interventions...
                    │   superviseur)   │
                    └────────┬─────────┘
                             │ HTTP (REST)
                    ┌────────▼─────────┐        ┌──────────────┐
   mobile/  ───────►│    backend/       │◄──────►│  Postgres    │
  (Expo, agent)      │  NestJS + Prisma  │        │  (Neon en dev)│
                    └────────┬─────────┘        └──────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
           Resend        Mapbox          Firebase Cloud
          (emails)     (géocodage)      Messaging (push)
```

## Les trois applications

### `backend/` — API

NestJS + Prisma, un module par domaine métier (`src/<domaine>/`) : `absences`, `interventions`, `attendance`, `sites`, `users`, `quotes`, `invoices`, `reports`, `settings`, `audit`, `chat`, `realtime`, `approvals`, etc.

- Auth JWT, rôles `ADMIN` / `SUPERVISOR` / `AGENT` (guard + décorateur `@Roles`).
- Audit log sur les actions sensibles (`audit.service.ts`) — qui a fait quoi, quand.
- Cache en mémoire sur `SitesService`/`UsersService` : une modification directe en base (script, seed) n'est visible qu'après redémarrage du backend.
- Migrations Prisma commitées dans `prisma/migrations/` — jamais générées à la volée en CI/prod (`prisma migrate deploy`, pas `migrate dev`).
- Realtime : SSE (`/realtime/stream`) pour les mises à jour live (chat, tableau de bord, présence).

### `frontend/` — web admin/superviseur

React + Vite, routes définies dans `src/routes/` (`AdminRoutes.tsx`, `SupervisionRoutes.tsx`, `AuthRoutes.tsx`), layout commun `AppLayout.tsx` (Sidebar + Topbar). Un jeu de composants UI partagés dans `src/components/ui/` (Badge, StatCard, Pagination, Modal, etc.) et de charts dans `src/components/charts/`.

### `mobile/` — app agent

Expo / React Native. Anciennement un sous-module git séparé (`madypro-mobile-clean`), fusionné dans `mobile/` avec historique préservé (2026-09-02) — ce n'est plus un submodule, un clone simple suffit.

## Infra & déploiement

- **Hébergement (depuis 2026-09-02)** : API sur **Render**, web sur **Vercel**, base Postgres sur **Neon**. Render et Vercel déploient depuis GitHub via leurs propres intégrations (branche suivie et variables d'environnement configurées dans leurs tableaux de bord respectifs). L'API Render est volontairement suspendue au 2026-09-24.
- **CI (GitHub Actions)** : `pr-checks.yml` uniquement — type-check, lint et tests sur chaque PR vers `develop`/`main`. Les anciens workflows `deploy-dev.yml`/`deploy-prod.yml` (images GHCR + SSH vers un VPS) ont été retirés avec l'abandon du VPS.
- **Compose** : `infra/compose/docker-compose.dev.yml` et `.prod.yml` datent de l'ancien déploiement VPS, conservés pour référence. Le `docker-compose.yml` à la racine sert au confort de dev local.
- **Base de données** : Postgres sur Neon (`backend/.env` → `DATABASE_URL`).
- **Terraform** (`infra/terraform/`) : provisionnement ponctuel d'EC2 pour des tests d'infra, pas une infra permanente.
- **Traefik** (`infra/traefik/`) : reverse-proxy TLS prévu pour l'ancien VPS, non utilisé avec Render/Vercel (qui fournissent le HTTPS).
- **Email** : Resend (migré depuis SendGrid — `backend/.env` local peut encore avoir les anciennes clés `SENDGRID_*`, à vérifier/nettoyer).
- **Notifications push** : Firebase Cloud Messaging.
- **Géocodage / carte** : Mapbox.

## Permissions

Trois rôles : `ADMIN` (accès complet), `SUPERVISOR` (scope restreint aux sites qu'il supervise, via la table `SiteSupervisor`), `AGENT` (mobile uniquement, ses propres données). Certains rapports sont volontairement `ADMIN`-only par choix produit (paie, facturation) — voir les décorateurs `@Roles` dans les contrôleurs concernés.

## Points d'attention connus

- Aucun test automatisé côté `frontend/`/`mobile/` — priorité `backend/` sur la logique métier sensible (voir `CONTRIBUTING.md`).
- Secrets gérés dans les tableaux de bord Render/Vercel et dans des `.env` locaux — pas de coffre-fort centralisé (voir la checklist sécurité).
