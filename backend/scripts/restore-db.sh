#!/usr/bin/env bash
# Restaure une sauvegarde dans une base CIBLE (de préférence une base neuve ou une branche Neon).
# Usage : ./scripts/restore-db.sh backups/mady-AAAAMMJJ-HHMM.dump "postgresql://…cible…"
# Refuse de restaurer sur la base de DATABASE_URL (pour ne pas écraser la base en service).
set -euo pipefail
# Des variables PGPORT/PGHOST laissées dans la session enverraient le client vers un autre serveur.
unset PGPORT PGHOST PGDATABASE PGUSER
cd "$(dirname "$0")/.."
FILE="${1:?Fichier de sauvegarde attendu}"
TARGET="${2:?Adresse de la base cible attendue}"
SOURCE="$(grep -E '^DATABASE_URL=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | sed 's/-pooler//' || true)"
host() { echo "$1" | sed -E 's#^[a-z]+://[^@]*@([^/:?]+).*#\1#' | sed 's/-pooler//'; }
dbname() { echo "$1" | sed -E 's#^[a-z]+://[^/]*/([^?]+).*#\1#'; }
if [ -n "$SOURCE" ] && [ "$(host "$SOURCE")/$(dbname "$SOURCE")" = "$(host "$TARGET")/$(dbname "$TARGET")" ]; then
  echo "La cible est la base en service : restauration refusée. Créez une base ou une branche neuve." >&2
  exit 1
fi
# Port explicite si absent (sinon pg_wrapper d'Ubuntu peut imposer celui d'un serveur local).
TARGET="$(echo "$TARGET" | sed -E 's#@([^/:?]+)/#@\1:5432/#')"
pg_restore --no-owner --no-privileges --clean --if-exists --dbname="$TARGET" "$FILE"
echo "Restauration terminée dans $(host "$TARGET")/$(dbname "$TARGET")"
