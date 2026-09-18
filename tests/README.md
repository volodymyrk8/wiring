# Tests

| Suite | Command | What it covers |
|-------|---------|----------------|
| **Router** | `npm run test:router` (after `npm run build`) | SPA paths, guards, `hrefFor` — `tests/router.test.mjs` |
| **API / app** | `python3 -m unittest discover -s tests -q` | Flask routes, auth, swipes, media — `test_app.py` |
| **Logic** | same unittest run | Catalog, icebreakers helpers — `test_logic.py` |
| **Support triage** | same | Task scoring — `test_support_triage.py` |
| **All** | `./scripts/test.sh` | Build client + router tests + unittest |

## Layout

```
tests/
  __init__.py
  spa_paths.py          # SPA shell GET paths (sync with src/router/routes.ts)
  router.test.mjs       # Built router bundle (public/dist/router.js)
  test_app.py           # Integration tests against Flask test client
  test_logic.py         # Unit tests for pure Python modules
  test_support_triage.py
```

Router source: `src/router/` → `public/dist/router.js` (loaded by `public/app.js`).

When adding a new SPA URL, update `app.py` routes, `src/router/routes.ts`, and `tests/spa_paths.py`, then extend `router.test.mjs` if matching/guards change.
