#!/usr/bin/env bash
set -Eeuo pipefail
REMOTE_DIR="${REMOTE_DIR:-/opt/ascit}"
cd "$REMOTE_DIR"
[[ -f .env ]] || { echo 'ERROR: buat .env dari .env.example terlebih dahulu.' >&2; exit 1; }
chmod 600 .env
docker compose build ascit-app
docker compose up -d ascit-db ascit-app
if [[ "${RUN_SEED:-false}" == "true" ]]; then
  docker compose run --rm -e ALLOW_DESTRUCTIVE_SEED=true ascit-app npx tsx prisma/seed.ts
fi
docker compose ps
