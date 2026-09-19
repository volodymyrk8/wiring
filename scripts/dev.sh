#!/usr/bin/env bash
# Local dev server — always http://127.0.0.1:5070 (see README).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
export HOST="${HOST:-127.0.0.1}"
export PORT=5070
./scripts/wait_for_postgres.sh
if [[ -f package.json ]]; then
  if [[ ! -d node_modules ]]; then
    npm install
  fi
  npm run build
fi
if [[ -x .venv/bin/python ]]; then
  PY=.venv/bin/python
else
  PY=python3
fi
"$PY" scripts/ensure_dev_user.py
# ensure_dev_user also seeds 10 extra profiles + 7 chat threads for Дев
exec "$PY" app.py
