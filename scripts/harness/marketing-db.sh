#!/usr/bin/env bash
# Recria um banco do harness do zero com a ala Marketing semeada.
# Uso: bash marketing-db.sh <banco> [dir-da-api]
#   <banco>      ex.: wf_m1a (só [a-z0-9_])
#   [dir-da-api] padrão ../../../workflow-api (o worktree da fase passa o dele)
# Saída: seed-out.<banco>.json e seed-marketing-out.<banco>.json nesta pasta.
# Pré-requisito: Postgres embutido no ar (node pg.mjs, porta 55432).
# NUNCA toca produção: o schema sai do schema.prisma, offline.
set -euo pipefail
DB="$1"
API_DIR="${2:-../../../workflow-api}"
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
SCHEMA="schema.$DB.sql"
(
  cd "$API_DIR"
  DOTENV_CONFIG_PATH=/nao-existe \
  DATABASE_URL_IPV6_FAST_CONNECTION="postgresql://postgres:postgres@127.0.0.1:55432/$DB" \
    npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script 2>/dev/null
) > "$SCHEMA"
HARNESS_DB="$DB" node apply-schema.mjs "$SCHEMA"
HARNESS_DB="$DB" node seed.mjs > "seed-out.$DB.json"
HARNESS_DB="$DB" SEED_OUT="seed-out.$DB.json" node seed-extra.mjs > /dev/null
HARNESS_DB="$DB" node seed-marketing.mjs > "seed-marketing-out.$DB.json"
rm -f "$SCHEMA"
echo "[marketing-db] $DB pronto: seed-out.$DB.json, seed-marketing-out.$DB.json"
