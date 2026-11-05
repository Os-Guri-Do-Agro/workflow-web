#!/usr/bin/env bash
# Sobe a API (build em dist/ de um diretorio) contra o Postgres local do harness.
# Uso: bash api.sh <dir-da-api> [porta]
# NUNCA carrega o .env de producao: DOTENV_CONFIG_PATH aponta para arquivo inexistente.
set -euo pipefail
DIR="$1"
PORT="${2:-3599}"
export NODE_ENV=development
export DOTENV_CONFIG_PATH="C:/nao-existe/.env"
export DATABASE_URL_IPV6_FAST_CONNECTION="postgresql://postgres:postgres@127.0.0.1:55432/wf?sslmode=disable"
export DATABASE_URL_IPV4_POOL_CONNECTION="$DATABASE_URL_IPV6_FAST_CONNECTION"
export JWT_SECRET="harness-jwt-secret-local-only"
export ENCRYPTION_KEY="harnesskey-32-bytes-local-only!!"
export PORT
export SUPABASE_BUCKET_URL="http://127.0.0.1:9"
export SUPABASE_SERVICE_ROLE_BUCKET_KEY="harness"
export TIMER_AUTO_STOP_ENABLED="false"
export FRONTEND_URL="http://localhost:5174"
export PUBLIC_API_URL="http://127.0.0.1:$PORT"
export QR_PUBLIC_BASE_URL="http://127.0.0.1:$PORT"
cd "$DIR"
exec node dist/src/main.js
