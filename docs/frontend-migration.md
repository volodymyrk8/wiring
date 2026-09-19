# Frontend migration map

The application uses a thin shell coordinator. Feature bundles own all user-facing SPA screens; the shell keeps session state, navigation, URL synchronization, and cross-screen services.

## Current ownership

| Screen / concern | Current owner | Status |
|---|---|---|
| Auth | `src/features/auth/` | Preact feature |
| Home | `src/features/home/` | Preact feature |
| Profile | `src/features/profile/ProfileScreen.tsx` | Preact feature |
| Consents | `src/features/profile/ConsentScreen.tsx` | Preact feature |
| WIRING+ | `src/features/profile/PlusScreen.tsx` | Preact feature |
| Chats and thread | `src/features/chat/ChatScreen.tsx` | Preact feature |
| Likes | `src/features/likes/` | Preact feature |
| Person profile | `src/features/person/` | Preact feature |
| Deck / swipe | `src/features/deck/` | Preact feature; gesture behavior kept in feature boundary |
| Invite / onboarding / delete account | `src/features/account/` | Preact feature |

## Shell responsibilities

`src/app/bootstrap.js` should shrink toward a coordinator with only:

- session and route state;
- navigation and URL synchronization;
- shared host bridges for feature bundles;
- cross-screen services such as API access, inbox polling, and photo upload.

New screen markup, feature-specific event binding, and new polling must not be added there. Put them in a feature module or a small `src/app/` service when they are cross-screen concerns.

## Migration checklist

1. Identify the screen's API payloads and existing backend tests.
2. Define a typed host bridge in `src/features/<name>/types.ts`.
3. Move markup and event handlers into a Preact screen with CSS Modules.
4. Mount it from the existing route without changing public URLs.
5. Use a visible module-load error state while the bundle is unavailable; do not add a second legacy renderer.
6. Add or update route/API tests and run `npm run typecheck`, `npm run build`, and `./scripts/test.sh`.
7. Remove the old renderer and its global CSS in the same migration change once the feature bundle is verified.

## Do not do during migration

- Do not introduce a second global store just to move one screen.
- Do not change API semantics and UI architecture in the same untested step.
- Do not add screen markup or feature-specific event binding back to `bootstrap.js`.
