import type { ViewId } from "@/router/types";

/** Canonical SPA paths (must match Flask `@app.get` in app.py). */
export const SPA_PATHS = {
  home: "/",
  login: "/sign-in",
  register: "/sign-up",
  forgot: "/forgot",
  reset: "/reset",
  verify: "/verify",
  deck: "/feed",
  likes: "/likes",
  matches: "/chats",
  profile: "/me",
  consents: "/consents",
  plus: "/plus",
  onboard: "/onboard",
  deleteAccount: "/delete-account",
  support: "/support",
} as const satisfies Record<string, string>;

export const STATIC_PATH_TO_VIEW: Record<string, ViewId> = {
  [SPA_PATHS.login]: "login",
  [SPA_PATHS.register]: "register",
  "/login": "login",
  "/register": "register",
  [SPA_PATHS.forgot]: "forgot",
  [SPA_PATHS.reset]: "reset",
  [SPA_PATHS.verify]: "verify",
  [SPA_PATHS.deck]: "deck",
  [SPA_PATHS.likes]: "likes",
  [SPA_PATHS.matches]: "matches",
  [SPA_PATHS.profile]: "profile",
  [SPA_PATHS.consents]: "consents",
  [SPA_PATHS.plus]: "plus",
  "/premium": "plus",
  [SPA_PATHS.onboard]: "onboard",
  [SPA_PATHS.deleteAccount]: "delete-account",
  [SPA_PATHS.support]: "support",
};

/** Views that need no session (hydrate allows direct URL). */
export const PUBLIC_VIEWS: ViewId[] = ["login", "register", "home", "forgot", "reset", "verify", "likes", "matches", "support"];
