#!/usr/bin/env bash
# Sobe a API a partir de uma CÓPIA do dist/ (quem builda de novo não derruba a
# API de quem está testando). Uso:
#   bash api-run.sh <dir-da-api> <porta> <banco> [pasta-de-execucao]
# A pasta de execução (padrão: <dir-da-api>/../.api-run-<porta>) recebe dist/ e
# um junction para o node_modules da API. NUNCA carrega o .env de produção
# (o api.sh aponta DOTENV_CONFIG_PATH para um arquivo inexistente).
set -euo pipefail
API_DIR="$(cd "$1" && pwd)"
PORT="$2"
DB="$3"
RUN_DIR="${4:-$API_DIR/../.api-run-$PORT}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$RUN_DIR"
RUN_DIR="$(cd "$RUN_DIR" && pwd)"
rm -rf "$RUN_DIR/dist"
cp -r "$API_DIR/dist" "$RUN_DIR/dist"
if [ ! -e "$RUN_DIR/node_modules" ]; then
  # junction (Windows) sem precisar de admin
  WIN_LINK="$(cygpath -w "$RUN_DIR/node_modules")"
  WIN_TARGET="$(cygpath -w "$API_DIR/node_modules")"
  cmd //c mklink //J "$WIN_LINK" "$WIN_TARGET" > /dev/null
fi
cp "$API_DIR/package.json" "$RUN_DIR/package.json"
HARNESS_DB="$DB" HARNESS_FRONT_URL="${HARNESS_FRONT_URL:-http://localhost:5174}" exec bash "$HERE/api.sh" "$RUN_DIR" "$PORT"
