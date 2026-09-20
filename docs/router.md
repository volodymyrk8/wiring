# SPA routing

The browser shell (`src/app/bootstrap.js`, built as `public/dist/app.js`) and Flask share the same URL scheme. Route logic is implemented in **`src/router/`** and shipped as **`public/dist/router.js`**.

## Source layout

```
src/router/
  routes.ts    # SPA_PATHS — keep in sync with app.py @app.get routes
  match.ts     # pathname → view (+ id for chat/person)
  paths.ts     # hrefFor, normalizePath
  guards.ts    # planRoute — guest vs authed (hydrateFromUrl)
  url-sync.ts  # history push/replace
```

## URLs

| Path | View | Notes |
|------|------|--------|
| `/` | home | |
| `/sign-in`, `/sign-up` … `/verify` | auth | Preact bundle (aliases: `/login`, `/register`) |
| `/feed` | deck | |
| `/likes` | likes | |
| `/chats` | matches | |
| `/chats/:id` | chat | Deep link |
| `/me` | profile | |
| `/notifications` | notifications | Preact profile bundle |
| `/onboard` | onboard | |
| `/p/:id` | person | Deep link |
| `/r/:code` | register | Referral invite |
| `/support` | support | Preact bundle |

Legal/admin (`/rules`, `/privacy`, `/admin`, …) are **server templates**, not this router.

## Shell integration

1. `ensureRouting()` loads `router.js` from the built distribution.
2. Boot: `/api/me` → `hydrateFromUrl()` uses `planRoute`.
3. Navigation: `goToView()` + `syncUrl()` at end of `render()`.
4. Auth screens call `syncUrl()` after Preact mount.

When adding a route: update **`routes.ts`**, **`app.py`** SPA GET, and **`router.test.mjs`**.

Server legal/admin templates load `public/dist/server-header.js` to mount the shared `AppHeader`; document bodies remain server-rendered and URLs are unchanged. Auth headers mount with the Preact auth feature.

The `/feed` URL is unchanged. The vertical Preact feed uses `GET /api/feed?limit=2` and `POST /api/feed/view`; scrolling does not call `/api/swipe`. Like/pass are explicit actions, with a shared Modal confirmation for permanent pass. SPA navigation retains loaded cards and position; document reload requests unseen delivery history, as documented in `architecture.md`.

The feed’s “Профиль” Button link uses the existing `/p/:id` route. Horizontal photo gestures and Left/Right keys are local gallery state and do not change the URL or send a swipe action.

`POST /api/feed/reset` is a WIRING+-only action in the exhausted `/feed` screen, behind shared Modal confirmation. It accepts the current `generation`; no new SPA route is introduced. Non-premium requests return 403.
