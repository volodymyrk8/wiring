# WIRING — guide for coding agents

## Before changing code

1. Read `README.md` and `docs/architecture.md`.
2. Identify whether the change belongs to Flask, the legacy shell, or a Preact feature.
3. Preserve the current URL contract and the PostgreSQL-only runtime.
4. Never use production accounts, secrets, or destructive database commands for local checks.

## Source map

| Area | Source of truth | Rule |
|---|---|---|
| Server/API | `app.py`, domain modules, `database.py` | Keep HTTP handlers thin when extracting new domain code. |
| SPA shell | `src/app/bootstrap.js` | Coordinator-only: routing, session state, API orchestration, and host bridges. Do not add screen markup here. |
| Shared client API | `src/app/api.ts` | Use the shared client and preserve same-origin credentials. |
| Inbox lifecycle | `src/app/inbox.ts` | Keep polling, badges, notices, and browser notifications here. |
| Preact UI | `src/features/<name>/` | Put screen logic, types, and feature styles together. |
| Shared UI | `src/components/ui/` | Reuse `Modal`, `Button`, `AppHeader`, and primitives before adding markup. |
| Routing | `src/router/` | A new SPA path requires updates to Flask, route definitions, and router tests. |
| Global styles | `public/styles.css` | Legacy compatibility surface. New Preact UI should prefer CSS Modules. |
| Static output | `public/dist/` | Generated; never edit or commit it. |

## Non-negotiable data rules

- `/api/unmatch`, block, and report hide a chat by setting `messages.deleted_at`; they must not delete message rows.
- Account deletion is a separate lifecycle and may purge auxiliary data after the documented retention period.
- Use parameterized SQL through the existing database wrapper.
- Do not introduce SQLite, an ORM, or a second state store without an explicit architecture decision.

## Site and mobile apps are one product

iOS and Android live in `mobile/` on `mobile/ios` and `mobile/android`. They are the same product as the site, not a separate design.

When a site change affects what a person sees or does — screens, copy, navigation, feed, chat, notifications, or themes — plan the smallest matching change for the apps in the same piece of work. If `mobile/` is in the working tree, make that change there. If it is not, name the app follow-up in the same change: which screen, which copy, and whether the existing `/api/*` already covers it (`docs/mobile-api.md`). Do not add a second API for an app-only variant of a site behavior.

Themes stay one set. The site themes are `mist` (день), `pastel` (пастель), `dusk` (сумерки), `night` (ночь), and `slate` (полночь): ids and labels in `THEME_LIST` (`src/components/ui/AppHeader.tsx`), browser chrome colors in `src/lib/theme.ts`, tokens in `public/styles.css` under `html[data-theme]`. Adding, renaming, or recoloring a theme updates the apps to the same ids, names, and palette. Do not give the apps a separate light/dark system or an extra theme.

## Frontend rules

- New code is TypeScript + Preact.
- Prefer typed host bridges and small feature modules over adding code to `bootstrap.js`.
- Keep effects cancellable or guarded when they perform polling or async navigation.
- Preserve mobile keyboard, safe-area, focus, and reduced-motion behavior.
- Use the existing modal component for confirmations; do not use `window.confirm` in new UI.

## Verification

Run the narrowest relevant checks while iterating, then the full set before handoff:

```sh
npm run typecheck
npm run build
npm run test:router
python3 -m unittest discover -s tests -q
```

`./scripts/test.sh` is the CI-equivalent command and requires PostgreSQL on the configured test port.

## Documentation rule

When moving a screen or changing an entrypoint, update `README.md`, `docs/architecture.md`, and `docs/router.md` in the same change. Do not leave references to `public/app.js` when the actual entrypoint is `public/dist/app.js`.
