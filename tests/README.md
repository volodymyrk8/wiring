# Tests

| Suite | Command | What it covers |
|-------|---------|----------------|
| **Typecheck** | `npm run typecheck` | Strict TypeScript and Vite configuration check |
| **Router** | `npm run test:router` (after `npm run build`) | SPA paths, guards, `hrefFor` — `tests/router.test.mjs` |
| **Deck browser (optional)** | `npm run test:deck:browser` (after build, Playwright installed) | Built deck and recommendations: touch inertia, cancellation, resize, photo/keyboard navigation and action buttons |
| **API / app** | `python3 -m unittest discover -s tests -q` | Flask routes, auth, swipes, media — `test_app.py` |
| **Logic** | same unittest run | Catalog, icebreakers helpers — `test_logic.py` |
| **Support triage** | same | Task scoring — `test_support_triage.py` |
| **All** | `./scripts/test.sh` | Typecheck + build client + router tests + unittest |

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

Router source: `src/router/` → `public/dist/router.js` (loaded by `src/app/bootstrap.js`).

When adding a new SPA URL, update `app.py` routes, `src/router/routes.ts`, and `tests/spa_paths.py`, then extend `router.test.mjs` if matching/guards change.

The browser suite serves only local built assets and synthetic profiles, mocks API responses, and blocks external network requests. It does not use PostgreSQL or a production login. It requires an existing Playwright installation and Chromium browser; they are not runtime dependencies of WIRING and are not required by the default CI suite. `PLAYWRIGHT_MODULE_PATH` may point to an external Playwright `index.mjs`, and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` may select an installed Chrome executable. Without overrides it uses `import("playwright")` and Playwright's default Chromium. This is mobile emulation, not a Safari or physical-device certification.
