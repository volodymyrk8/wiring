#!/usr/bin/env bash
# Wait until docker-compose Postgres accepts connections (DATABASE_URL must be set).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

url="${DATABASE_URL:-}"
if [[ "$url" != postgres* ]]; then
  exit 0
fi

if command -v pg_isready >/dev/null 2>&1 && pg_isready -d "$url" >/dev/null 2>&1; then
  exit 0
fi

PY="python3"
if [[ -x .venv/bin/python ]]; then
  PY=".venv/bin/python"
fi

if "$PY" -c "import os, psycopg; conn = psycopg.connect(os.environ.get('DATABASE_URL','')); conn.close()" >/dev/null 2>&1; then
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
    docker compose exec -T postgres psql -U wiring_dev -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'wiring_test'" | grep -q 1 || docker compose exec -T postgres psql -U wiring_dev -d postgres -c "CREATE DATABASE wiring_test" >/dev/null 2>&1 || true
    echo " ok"
    exit 0
  fi
  echo -n "."
  sleep 1
done
echo
echo "Postgres did not become ready in time." >&2
exit 1
