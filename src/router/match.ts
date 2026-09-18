import { STATIC_PATH_TO_VIEW } from "@/router/routes";
import { normalizePath } from "@/router/paths";
import type { MatchedRoute } from "@/router/types";

export function matchRoute(pathname: string, basePath: string): MatchedRoute {
  const p = normalizePath(pathname, basePath);

  const invite = p.match(/^\/r\/([A-Za-z0-9]{4,16})$/i);
  if (invite) {
    return { view: "register", inviteRef: invite[1] };
  }

  const chat = p.match(/^\/chats\/(\d+)$/);
  if (chat) return { view: "chat", id: Number(chat[1]) };

  const person = p.match(/^\/p\/(\d+)$/);
  if (person) return { view: "person", id: Number(person[1]) };

  const view = STATIC_PATH_TO_VIEW[p];
  if (view) return { view };

  return { view: "home" };
}
