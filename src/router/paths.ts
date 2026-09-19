import { SPA_PATHS } from "@/router/routes";
import type { ViewId } from "@/router/types";

export function normalizePath(pathname: string, basePath: string): string {
  let p = pathname || "/";
  if (basePath && p.startsWith(basePath)) p = p.slice(basePath.length) || "/";
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

const PATH_BY_VIEW: Record<ViewId, string | ((extra: { id?: number }) => string)> = {
  home: SPA_PATHS.home === "/" ? "/" : SPA_PATHS.home,
  login: SPA_PATHS.login,
  register: SPA_PATHS.register,
  forgot: SPA_PATHS.forgot,
  reset: SPA_PATHS.reset,
  verify: SPA_PATHS.verify,
  deck: SPA_PATHS.deck,
  likes: SPA_PATHS.likes,
  matches: SPA_PATHS.matches,
  chat: (extra) => (extra.id ? `/chats/${extra.id}` : SPA_PATHS.matches),
  profile: SPA_PATHS.profile,
  onboard: SPA_PATHS.onboard,
  person: (extra) => (extra.id ? `/p/${extra.id}` : SPA_PATHS.deck),
  "delete-account": SPA_PATHS.deleteAccount,
};

export function hrefFor(basePath: string, view: ViewId, extra: { id?: number } = {}): string {
  const mapped = PATH_BY_VIEW[view];
  const path = typeof mapped === "function" ? mapped(extra) : mapped;
  return `${basePath}${path}`;
}
