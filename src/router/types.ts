/** SPA view ids (legacy name kept for app.js state.view). */
export type ViewId =
  | "home"
  | "login"
  | "register"
  | "forgot"
  | "reset"
  | "verify"
  | "deck"
  | "likes"
  | "matches"
  | "chat"
  | "profile"
  | "onboard"
  | "person"
  | "delete-account";

export type MatchedRoute = {
  view: ViewId;
  /** Chat or person profile id from URL. */
  id?: number;
  /** Invite code captured from /r/:code (caller should persist). */
  inviteRef?: string;
};

export type GuestSession = {
  loggedIn: false;
};

export type UserSession = {
  loggedIn: true;
  isGuest: boolean;
};

export type Session = GuestSession | UserSession;

export type RoutePlan =
  | { kind: "show"; view: ViewId }
  | { kind: "login"; pendingPath: string }
  | { kind: "feed" }
  | { kind: "person"; id: number }
  | { kind: "chat"; id: number };
