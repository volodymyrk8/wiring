#!/usr/bin/env bash
# Full project test suite (frontend router + Python API).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

./scripts/wait_for_postgres.sh

if [[ -f package.json ]]; then
  if [[ "${CI:-}" == "true" ]] || [[ ! -d node_modules ]]; then
    npm ci
  fi
  npm run build
  npm run test:router
fi

if [[ -x .venv/bin/python ]]; then
  PY=.venv/bin/python
else
  PY=python3
fi

export DATABASE_URL="${TEST_DATABASE_URL:-postgresql://wiring_dev:wiring_dev@127.0.0.1:5433/wiring_test}"

"$PY" -m unittest discover -s tests -q
