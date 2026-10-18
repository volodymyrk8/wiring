import { hrefFor } from "@/router/paths";
import type { ViewId } from "@/router/types";

/** Bottom tabs: replace history entry so iOS/back does not bounce feed ↔ profile. */
const MAIN_TAB_VIEWS = new Set<ViewId>([
  "home",
  "deck",
  "recommendations",
  "likes",
  "matches",
  "profile",
]);

export type UrlSyncState = {
  lastUrl: string;
};

export function syncViewToUrl(
  state: UrlSyncState,
  basePath: string,
  view: ViewId,
  extra: { id?: number } = {},
): void {
  const url = hrefFor(basePath, view, extra);
  if (!url) return;
  const pathNow = location.pathname;
  if (url === state.lastUrl && pathNow === url) return;
  const replace = !state.lastUrl || pathNow === url || MAIN_TAB_VIEWS.has(view);
  state.lastUrl = url;
  if (pathNow !== url) {
    if (replace) history.replaceState({ view }, "", url);
    else {
      history.pushState({ view }, "", url);
      try {
        (window as unknown as { WIRING_ANALYTICS?: { page?: (u: string) => void } }).WIRING_ANALYTICS?.page?.(url);
      } catch {
        /* ignore */
      }
    }
  }
}
