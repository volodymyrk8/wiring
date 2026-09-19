#!/usr/bin/env bash
# Full project test suite (frontend router + Python API).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f package.json ]]; then
  if [[ "${CI:-}" == "true" ]] || [[ ! -d node_modules ]]; then
    npm ci
  fi
  npm run build
  npm run test:router
fi

python3 -m unittest discover -s tests -q
