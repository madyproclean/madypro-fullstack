# Contribuer à mj-planning (Mady Proclean)

## Structure du repo

```
mj-planning/
├── backend/     # API NestJS + Prisma (Postgres)
├── frontend/    # Web admin/superviseur — React + Vite
├── mobile/      # App agent — Expo / React Native
└── infra/
    ├── terraform/   # Provisioning ponctuel (EC2 à la demande)
    ├── compose/     # docker-compose.dev.yml / .prod.yml (ancien déploiement VPS, référence)
    └── traefik/     # Reverse-proxy TLS (ancien VPS, non utilisé)
```

## Setup local

Voir `docs/onboarding.md` pour le détail. En résumé :

```bash
cd backend && npm install && npx prisma generate
cd ../frontend && npm install
```

Backend : `npm run start:dev` (port 3000). Frontend : `npm run dev` (port 5173).

## Convention de commit

Préfixe type + scope, message en français dans le corps :

```
feat(absences): ajoute le contrôle de chevauchement de dates
fix(chat): reconnecte le flux SSE après coupure réseau
chore(infra): migre le repo vers l'organisation GitHub madyproclean
```

Types utilisés dans l'historique : `feat`, `fix`, `chore`. Le scope est le module concerné (nom de dossier sous `backend/src/`, `frontend/src/pages/`, etc.).

## Process de PR

- Toute modification passe par une Pull Request vers `develop` (ou `main` pour un correctif urgent validé).
- La CI (`pr-checks.yml`) bloque le merge si `tsc --noEmit`, `npm run lint` ou les tests échouent, sur `backend/` et `frontend/`.
- `main` déploie automatiquement en **prod** au push, `develop` déploie automatiquement en **dev** au push — donc un merge sur `main` part en prod immédiatement une fois la CI verte.
- Revue par au moins une autre personne avant merge, dès que l'équipe compte plus d'une personne.

## Lancer les tests

```bash
cd backend
npm run lint           # eslint
npm test               # tests unitaires (Jest, *.spec.ts)
npm run test:e2e       # tests e2e (nécessite une base de test — voir test/jest-e2e.json)
```

Même chose côté `frontend/` avec `npm run lint` (pas de tests automatisés pour l'instant côté web).

Aucun test n'existe côté `frontend/` ou `mobile/` pour l'instant — priorité au backend sur la logique métier sensible (paie, quotas, transitions de statut, chevauchement d'absences) en premier.

## Definition of Done

Une tâche est terminée quand :

- [ ] Le code compile (`tsc --noEmit`) sans erreur sur les packages touchés
- [ ] Testé manuellement sur l'environnement `dev` (ou couvert par un test automatisé pour la logique métier)
- [ ] Pas de régression connue sur les parcours voisins
- [ ] Revu par au moins une autre personne (dès que l'équipe le permet)
- [ ] Déployé et vérifié sur `dev` avant merge vers `main`
