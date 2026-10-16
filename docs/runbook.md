# Runbook — incidents & opérations manuelles

## L'API ne répond plus

Hébergement actuel : API sur **Render**, web sur **Vercel**, base sur **Neon**.

1. Tester `https://<service>.onrender.com/health`. Une réponse `503` avec l'en-tête `x-render-routing: suspend` signifie que le service est **suspendu** côté Render (action manuelle ou facturation) — rien à corriger dans le code, il faut le réactiver dans le tableau de bord Render.
2. Sinon, ouvrir le service dans le tableau de bord Render → onglet **Logs** pour voir l'erreur de démarrage.
3. Vérifier les variables d'environnement du service (onglet **Environment**), notamment `DATABASE_URL`.
4. Vérifier que la base Neon répond (tableau de bord Neon) — si elle est injoignable (quota, projet suspendu), l'API ne démarre pas.

## Redéploiement manuel

- **API (Render)** : tableau de bord du service → **Manual Deploy** → *Deploy latest commit*.
- **Web (Vercel)** : projet → onglet **Deployments** → menu du dernier déploiement → **Redeploy**.

## Déploiement cassé / rollback

1. Lire les logs de build/démarrage du déploiement fautif (Render : onglet **Events**/**Logs** ; Vercel : détail du déploiement).
2. Si c'est une migration Prisma qui bloque le démarrage : l'erreur exacte apparaît dans les logs Render (`prisma migrate deploy`).
3. Rollback rapide : Render → **Rollback** vers le déploiement précédent ; Vercel → **Instant Rollback** / *Promote* d'un déploiement antérieur. Puis corriger via une PR (revert du commit fautif si besoin).

## Restauration d'une sauvegarde base de données

⚠️ **Aucune procédure de sauvegarde/restauration n'est confirmée testée à ce jour** (voir `docs/onboarding.md`, section Sécurité). Avant de se fier à un backup en situation d'urgence :

1. Confirmer avec l'équipe où les sauvegardes sont stockées (snapshots / point-in-time restore Neon ? export supplémentaire ?).
2. Si Neon : les backups automatiques Neon (point-in-time restore) sont probablement la source la plus fiable — vérifier la rétention dans le dashboard Neon du projet.
3. Faire un essai de restauration en dev **avant** d'en avoir besoin en prod, et documenter ici la procédure une fois validée.

## Migration Prisma qui casse le démarrage en local

Symptôme connu : `nest start --watch` laisse parfois un `tsconfig.build.tsbuildinfo`/`dist` incohérent après un arrêt brutal, provoquant un faux `MODULE_NOT_FOUND` au redémarrage.

```bash
cd backend
rm -rf dist tsconfig.build.tsbuildinfo
npm run start:dev
```

Si l'erreur est `The column "X" does not exist in the current database` : une migration Prisma commitée n'a pas été appliquée sur la base ciblée par `DATABASE_URL`.

```bash
npx prisma migrate status   # liste les migrations en attente
npx prisma migrate deploy   # les applique (jamais migrate dev en dehors du poste perso)
```

## Comptes de test / seed

`npx prisma db seed` (ou `npm run prisma:seed`) crée des comptes de démo, dont un admin — voir `backend/prisma/seed.ts` pour les identifiants exacts. Ne jamais utiliser ces identifiants comme mot de passe de prod.
