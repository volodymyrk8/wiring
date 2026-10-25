# Tests

| Suite | Command | What it covers |
|-------|---------|----------------|
| **Typecheck** | `npm run typecheck` | Strict TypeScript and Vite configuration check |
| **Languages** | `npm run test:i18n` and Python `test_i18n.py` | English coverage, placeholders, original member text, static legal/glossary copy, canonical catalog ids, persistence and failure/guest paths |
| **Languages in browser (optional)** | `npm run test:i18n:browser` (after build, same Playwright overrides) | English screens, RU/EN switching, saved preference and chat drafts, unchanged member content and mobile/desktop layout |
| **Router** | `npm run test:router` (after `npm run build`) | SPA paths, guards, `hrefFor` — `tests/router.test.mjs` |
| **Deck browser (optional)** | `npm run test:deck:browser` (after build, Playwright installed) | Built deck and recommendations: touch inertia, cancellation, resize, photo/keyboard navigation, action buttons and recommendation position restoration after navigation (fresh/reordered/removed candidates, exhausted list, retry, explicit refresh and aborted response) |
| **UI bug regressions (optional)** | `npm run test:ui:browser` (after build, same Playwright overrides) | Incoming like actions, confirmation/cancel/error, duplicate and navigation guards, bottom profile back, country search and unread badge alignment |
| **Admin tabs (optional)** | `npm run test:admin:browser` (after build, same Playwright overrides; local `.venv` required) | Real Jinja template with synthetic data, tab history/deep links, keyboard, retained reply drafts, mobile overflow, no-JS fallback; no database or production account |
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

Moderation/name regressions in `test_app.py`, `test_mobile_api.py` and `test_notify.py` cover each-report/ban mail routing, transport failure, admin session/CSRF permissions, replay and mail retry, account-only history, banned/mobile access, no-contact handling, rate limits, account-purge retention, 14-day boundaries and concurrent name updates. The optional UI browser suite additionally verifies name confirmation/locking, support history and actual admin form payloads; its form submission is intercepted locally. The profile autosave suite verifies the shared queue with a concurrent confirmed name change. Test setup clears inherited mail/Telegram transports; transport checks use mocks.

Own-profile browser regression: `npm run test:profile:browser` after build, with the same Playwright overrides. It uses the full shell, mocked local APIs, and verifies `/me` preview → explicit `/me/edit` → reload → profile-tab preview, without an implicit profile save. Optional `PUBLISHED_ASSETS=1` runs the same assertions on public assets after release. `PUBLISHED_BASELINE=1` reproduces the pre-fix editor entry using public assets only; it never reads a production account or sends a production API mutation.
