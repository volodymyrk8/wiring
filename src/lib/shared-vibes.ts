import { splitCatalogTags } from "@/lib/catalog-tags";
import type { CatalogItem } from "@/features/profile/types";

type TagCatalog = { neuro?: CatalogItem[]; vibe?: CatalogItem[] };

/** Vibe tag ids that both profiles have (current catalog only). */
export function sharedVibeIdSet(
  mine: string[] | undefined,
  theirs: string[] | undefined,
  catalog: TagCatalog,
): Set<string> {
  const myVibes = new Set(splitCatalogTags([], mine, catalog).vibe);
  const shared = new Set<string>();
  for (const id of splitCatalogTags([], theirs, catalog).vibe) {
    if (myVibes.has(id)) shared.add(id);
  }
  return shared;
}

/** Neuro tag ids that both profiles have (current catalog only). */
export function sharedNeuroIdSet(
  mine: string[] | undefined,
  theirs: string[] | undefined,
  catalog: TagCatalog,
): Set<string> {
  const myNeuro = new Set(splitCatalogTags(mine, [], catalog).neuro);
  const shared = new Set<string>();
  for (const id of splitCatalogTags(theirs, [], catalog).neuro) {
    if (myNeuro.has(id)) shared.add(id);
  }
  return shared;
}
