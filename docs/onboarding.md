# Onboarding — mj-planning (Mady Proclean)

Version vivante du playbook d'intégration. Suivi coché au fur et à mesure dans `docs/onboarding-checklist.md` — ce document-ci explique le *pourquoi*, la checklist suit le *quoi*.

## Stack

| | |
|---|---|
| API | NestJS + Prisma |
| Base | Postgres (Neon) |
| Web admin/superviseur | React + Vite (`frontend/`) |
| Mobile agent | Expo / React Native (`mobile/`) |
| Hébergement | API Render · web Vercel · base Neon |
| CI | GitHub Actions (`pr-checks.yml` : tsc + lint + tests sur PR) |
| Email | Resend |
| Géocodage / carte | Mapbox |
| Push | Firebase Cloud Messaging |

Détail complet : `docs/architecture.md`.

## Jour 1 — accès à demander

Voir `docs/onboarding-checklist.md` section 1. Pousser pour des identifiants **nominatifs** (un compte GitHub/AWS par personne) plutôt que des clés partagées — c'est ce qui permet de savoir qui a fait quoi le jour où un incident doit être élucidé.

## Setup local

```bash
git clone <repo>
cd backend && npm install && npx prisma generate && npx prisma migrate deploy
cd ../frontend && npm install
```

- `mobile/` n'est plus un sous-module git (fusionné le 2026-09-02, historique préservé) — un clone simple du repo suffit, pas besoin de `--recurse-submodules`.
- Backend : `npm run start:dev` (port 3000, watch mode).
- Frontend : `npm run dev` (port 5173).
- Mobile : `expo start --tunnel`, avec un `.env.local` pointant vers l'IP locale de l'API pour tester sur téléphone physique.
- Le `docker-compose.yml` à la racine est cassé (référence `./api` au lieu de `./backend`) — ne pas s'y fier, lancer les deux services directement comme ci-dessus.

## Git & déploiement

`main` déploie en **prod**, `develop` déploie en **dev**, tous deux automatiquement au `push` (déjà en place, pas seulement `workflow_dispatch`). Voir `CONTRIBUTING.md` pour la convention de commit et le process de PR attendu, `docs/runbook.md` pour les procédures d'incident.

**Ce qui reste à faire** (pas encore en place) :
- Process de PR *obligatoire* — rien n'empêche aujourd'hui un push direct sur `main` qui parte en prod sans relecture.
- DNS + Traefik + HTTPS propres, en remplacement des ports directs actuels.

## Cadre agile

Rien de formel n'existait avant le 2026-09 (pas de board, pas de rituel). Cible minimale pour une équipe qui grandit :

- **Sprint** d'1 semaine tant que l'équipe est petite (2-4 personnes) — boucle de feedback plus rapide.
- **Planning** en début de sprint, capacité réaliste (pas 100% du temps en dev).
- **Daily** 10-15 min — blocages, pas un rapport d'avancement ligne à ligne.
- **Revue de sprint** avec démo réelle sur l'environnement `dev`.
- **Rétro** — 20 minutes valent mieux que rien tant que le process est encore à roder.
- **Board** : GitHub Projects visé, mais le token `gh` de ce poste n'a pas le scope `project` (`gh auth refresh -s project`, action interactive). En attendant, backlog technique suivi via des issues GitHub étiquetées `tech-debt`/`decision-needed`.
- **Definition of Done** écrite dans `CONTRIBUTING.md`.
- **Backlog technique** séparé pour la dette découverte pendant les campagnes de QA manuelles (module par module — méthodologie déjà en place, à formaliser plutôt qu'à remplacer). 7 premières issues créées le 2026-09-07 à partir des gaps déjà identifiés en QA.

## Qualité & tests

Le gap le plus important du repo au démarrage de ce chantier : **aucun test automatisé**. Toute la validation se faisait manuellement (QA module par module, curl, recalculs à la main).

État actuel :
- Jest configuré côté `backend/` (`npm test`) — la dépendance était présente mais sans aucune config, aucun test ne pouvait tourner avant le 2026-09-07.
- Eslint configuré côté `backend/` et `frontend/` (`npm run lint`, flat config `typescript-eslint`) — n'existait pas non plus avant le 2026-09-08.
- Premiers tests unitaires sur la logique la plus sensible : chevauchement de dates d'absence, transitions de statut devis/facture (+ garde de paiement), quota d'heures/pénalité, calcul de paie (heures normales/majorées, seuil légal 35h/semaine). 21 tests, 4 suites.
- CI (`pr-checks.yml`) bloque la merge sur `tsc --noEmit` + lint + `npm test`, backend et frontend.
- Pas encore fait : tests d'intégration sur les endpoints (base de test dédiée), tests e2e web (Playwright), couverture sur `frontend/`/`mobile/`.

## Sécurité & secrets

- Secrets répartis entre les tableaux de bord Render/Vercel et des `.env` locaux — pas de coffre-fort centralisé (à évaluer).
- Rotation à prévoir sur les clés API tierces (Resend, Mapbox) au moindre doute de fuite.
- Sauvegarde de base **non testée en restauration** — voir `docs/runbook.md`, section dédiée, avant de s'y fier en urgence.

## Observabilité

Rien n'est en place pour être alerté d'un problème en prod avant qu'un utilisateur ne le signale : pas de Sentry (ou équivalent), pas de check d'uptime externe, logs consultables seulement via `docker logs` en SSH.

## Plan de mise en place — 30 / 60 / 90 jours

**Jours 1–30 — comprendre avant de changer**
- Tous les accès obtenus
- Environnement local fonctionnel de bout en bout
- CI de base : type-check + lint + tests bloquants sur PR ✅ (`pr-checks.yml`)
- 3 premiers tests unitaires sur la logique critique ✅ (absences, devis/factures, quota d'heures, paie)

**Jours 30–60 — poser les fondations**
- Process de PR obligatoire (protection de branche sur `main`)
- Premier board de sprint, premier cycle agile complet (planning → daily → revue → rétro)
- Sentry + check d'uptime en place, alerte testée en conditions réelles
- Secrets déplacés hors des `.env` en clair

**Jours 60–90 — industrialiser**
- Couverture de test sur tous les modules à règles métier sensibles
- DNS + Traefik + HTTPS propres en prod
- Runbook incident testé une fois « pour de vrai »
- Rétro à 90 jours : qu'est-ce qui a vraiment aidé l'équipe

Suivi détaillé, coché item par item : `docs/onboarding-checklist.md`.
