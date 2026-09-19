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
| SPA shell | `src/app/bootstrap.js` | Legacy-only. Do not add new screens here; extract or migrate existing code instead. |
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
