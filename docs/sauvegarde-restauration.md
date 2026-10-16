# Sauvegarde et restauration de la base

La base de données contient tout : sites, gabarits, missions, pointages, absences, factures.
Deux protections se complètent.

## 1. Retour en arrière chez l'hébergeur (Neon)

Neon garde l'historique de la base pendant quelques jours (7 jours sur l'offre gratuite,
jusqu'à 30 jours sur les offres payantes : à vérifier dans *Settings › Storage* du projet).

En cas d'erreur grave (données effacées par erreur, mauvaise manipulation) :

1. Ouvrir la console Neon, projet de production.
2. *Branches › Create branch* : choisir **« Past data »** et l'heure juste avant le problème.
3. Vérifier les données sur cette nouvelle branche (adresse de connexion dans *Connection details*).
4. Si tout est bon : *Restore* (remet la branche principale à cet instant), ou faire pointer
   le serveur sur la nouvelle branche le temps de corriger.

Ne jamais supprimer la branche principale.

## 2. Sauvegarde dans un fichier (à garder hors de chez Neon)

Utile si le compte Neon devient inaccessible, ou pour garder une copie au-delà de l'historique.

Sauvegarder (lecture seule, rien n'est modifié) :

```bash
cd backend
./scripts/backup-db.sh        # garde les 14 dernières sauvegardes dans backend/backups/
```

Le script vérifie que l'archive est lisible et contient bien les missions. Copier ensuite
le fichier `backend/backups/mady-AAAAMMJJ-HHMM.dump` sur un disque ou un stockage externe
(il contient des données personnelles : ne pas l'envoyer par e-mail).

Pour une sauvegarde automatique chaque nuit à 2 h, sur une machine allumée :

```
0 2 * * * cd /chemin/vers/mj-planning/backend && ./scripts/backup-db.sh >> backups/journal.log 2>&1
```

(à ajouter avec `crontab -e`).

## 3. Restaurer un fichier de sauvegarde

Toujours restaurer dans une base **neuve** (une branche Neon vide, ou une autre base),
jamais par-dessus la base en service : le script le refuse de lui-même.

```bash
cd backend
./scripts/restore-db.sh backups/mady-AAAAMMJJ-HHMM.dump "postgresql://utilisateur:motdepasse@hote:5432/base?sslmode=require"
```

Puis vérifier les données, et seulement ensuite faire pointer le serveur (variable
`DATABASE_URL` sur Render) vers cette base.

## Essai réalisé

Le 16/10/2026 : sauvegarde de la base de démonstration (756 Ko), restaurée dans une base
jetable ; mêmes nombres de sites (17), comptes (15), gabarits (17), missions (282) et
pointages (307) qu'à l'origine. La restauration vers la base en service a bien été refusée.

À refaire tous les trois mois, ou après un changement important du schéma.

## Bon à savoir

Sous Ubuntu, si une base PostgreSQL locale est installée, les outils `psql` / `pg_dump`
utilisent son port (5433…) quand l'adresse n'en précise pas : le script de sauvegarde
ajoute donc toujours `:5432`.
