import type { CatalogItem } from "@/features/profile/types";

export function catalogIdSet(items: CatalogItem[] | undefined): Set<string> {
  return new Set((items || []).map((item) => item.id));
}

/** Tags shown in UI — current catalog only; neuro ids stored under vibe move to neuro. */
export function splitCatalogTags(
  neuro: string[] | undefined,
  vibe: string[] | undefined,
  catalog: { neuro?: CatalogItem[]; vibe?: CatalogItem[] },
): { neuro: string[]; vibe: string[] } {
  const neuroIds = catalogIdSet(catalog.neuro);
  const vibeIds = catalogIdSet(catalog.vibe);
  const neuroOut: string[] = [];
  const seenNeuro = new Set<string>();
  for (const id of neuro || []) {
    if (neuroIds.has(id) && !seenNeuro.has(id)) {
      seenNeuro.add(id);
      neuroOut.push(id);
    }
  }
  const vibeOut: string[] = [];
  const seenVibe = new Set<string>();
  for (const id of vibe || []) {
    if (vibeIds.has(id)) {
      if (!seenVibe.has(id)) {
        seenVibe.add(id);
        vibeOut.push(id);
      }
      continue;
    }
    if (neuroIds.has(id) && !seenNeuro.has(id)) {
      seenNeuro.add(id);
      neuroOut.push(id);
    }
  }
  return { neuro: neuroOut, vibe: vibeOut };
}

export function labelForTag(
  kind: "neuro" | "vibe",
  id: string,
  catalog: { neuro?: CatalogItem[]; vibe?: CatalogItem[] },
): string | null {
  const list = kind === "neuro" ? catalog.neuro : catalog.vibe;
  const item = list?.find((entry) => entry.id === id);
  return item?.label || null;
}
