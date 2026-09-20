import type { ApiClient } from "./api";
import type { DeckFilters, FeedPage } from "@/features/deck/types";

/** Small pages reserve only the current card and one upcoming card. */
export function fetchFeed(api: ApiClient, filters: DeckFilters, signal?: AbortSignal): Promise<FeedPage> {
  const query = new URLSearchParams({ limit: "2" });
  if (filters.neuro.length) query.set("neuro", filters.neuro.join(","));
  if (filters.vibe.length) query.set("vibe", filters.vibe.join(","));
  if (filters.intents.length) query.set("intent", filters.intents.join(","));
  if (filters.min_age !== 18) query.set("min_age", String(filters.min_age));
  if (filters.max_age !== 99) query.set("max_age", String(filters.max_age));
  if (filters.city) query.set("city", filters.city);
  if (filters.real_only) query.set("real", "1");
  return api<FeedPage>(`/api/feed?${query}`, { signal, cache: "no-store" });
}
