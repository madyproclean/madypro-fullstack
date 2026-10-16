#!/usr/bin/env bash
# Sauvegarde complète de la base (format compressé pg_dump), datée, dans backend/backups/.
# Usage : cd backend && ./scripts/backup-db.sh [nombre de sauvegardes à garder, 14 par défaut]
# La base est lue avec DATABASE_URL (fichier .env) ; aucune donnée n'est modifiée.
set -euo pipefail
# Des variables PGPORT/PGHOST laissées dans la session enverraient le client vers un autre serveur.
unset PGPORT PGHOST PGDATABASE PGUSER
cd "$(dirname "$0")/.."
KEEP="${1:-14}"
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"
fi
[ -n "${DATABASE_URL:-}" ] || { echo "DATABASE_URL introuvable" >&2; exit 1; }
# Connexion directe (sans le répartiteur « -pooler ») et sans paramètres propres à Prisma.
URL="$(echo "$DATABASE_URL" | sed -e 's/-pooler//' -e 's/[?&]pgbouncer=[^&]*//' -e 's/[?&]connection_limit=[^&]*//')"
# Port explicite : sous Ubuntu, l'enveloppe pg_wrapper impose sinon le port d'un serveur local (5433…).
URL="$(echo "$URL" | sed -E 's#@([^/:?]+)/#@\1:5432/#')"
mkdir -p backups
FILE="backups/mady-$(date +%Y%m%d-%H%M).dump"
# Une sauvegarde interrompue ne doit pas laisser de fichier vide ou partiel.
trap 'rm -f "$FILE"' ERR
pg_dump --format=custom --no-owner --no-privileges --dbname="$URL" --file="$FILE"
# Contrôle : l'archive doit être lisible et contenir les tables principales.
pg_restore --list "$FILE" | grep -qE 'TABLE DATA public "?Intervention"? ' || { echo "Archive incomplète : $FILE" >&2; rm -f "$FILE"; exit 1; }
echo "Sauvegarde OK : $FILE ($(du -h "$FILE" | cut -f1))"
ls -1t backups/mady-*.dump | tail -n +$((KEEP + 1)) | xargs -r rm --
