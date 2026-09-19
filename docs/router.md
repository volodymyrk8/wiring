# SPA routing

The browser shell (`public/app.js`) and Flask share the same URL scheme. Route logic is implemented in **`src/router/`** and shipped as **`public/dist/router.js`**.

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
| `/onboard` | onboard | |
| `/p/:id` | person | Deep link |
| `/r/:code` | register | Referral invite |

Legal/admin (`/rules`, `/admin`, …) are **server templates**, not this router.

## Shell integration

1. `ensureRouting()` loads `router.js`.
2. Boot: `/api/me` → `hydrateFromUrl()` uses `planRoute`.
3. Navigation: `goToView()` + `syncUrl()` at end of `render()`.
4. Auth screens call `syncUrl()` after Preact mount.

When adding a route: update **`routes.ts`**, **`app.py`** SPA GET, and **`router.test.mjs`**.
