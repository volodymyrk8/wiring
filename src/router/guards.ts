import { PUBLIC_VIEWS } from "@/router/routes";
import type { MatchedRoute, RoutePlan, Session, ViewId } from "@/router/types";

/** Map URL + session to what the shell should do (mirrors hydrateFromUrl rules). */
export function planRoute(route: MatchedRoute, session: Session, pathname: string): RoutePlan {
  if (!session.loggedIn) {
    if (PUBLIC_VIEWS.includes(route.view as ViewId)) {
      return { kind: "show", view: route.view };
    }
    return { kind: "login", pendingPath: pathname };
  }

  if (route.view === "onboard" || ((route.view === "login" || route.view === "register") && !session.isGuest)) {
    return { kind: "feed" };
  }

  if (route.view === "home") {
    return { kind: "show", view: "home" };
  }

  if (route.view === "person" && route.id) {
    return { kind: "person", id: route.id };
  }

  if (route.view === "chat" && route.id) {
    return { kind: "chat", id: route.id };
  }

  return { kind: "show", view: route.view };
}
