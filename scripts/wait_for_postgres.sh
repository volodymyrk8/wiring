#!/usr/bin/env bash
# Wait until docker-compose Postgres accepts connections (DATABASE_URL must be set).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

url="${DATABASE_URL:-}"
if [[ "$url" != postgres* ]]; then
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "DATABASE_URL is Postgres but docker is not installed." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "DATABASE_URL is Postgres but Docker is not running. Start Docker Desktop, then retry." >&2
  exit 1
fi

docker compose up -d postgres

echo -n "Waiting for Postgres (wiring-postgres-dev)"
for _ in $(seq 1 60); do
  if docker compose exec -T postgres pg_isready -U wiring_dev -d wiring_dev >/dev/null 2>&1; then
    echo " ok"
    exit 0
  fi
  echo -n "."
  sleep 1
done
echo
echo "Postgres did not become ready in time." >&2
exit 1
