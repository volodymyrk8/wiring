import type { CatalogItem } from "@/features/profile/types";

const NEURO_COMBO = "audhd";
const NEURO_COMBO_PARTS = new Set(["asd", "adhd"]);

/** AuDHD already covers ASD and ADHD, so those tags do not stay selected with it. */
export function settleNeuro(ids: string[]): string[] {
  if (!ids.includes(NEURO_COMBO)) return ids;
  return ids.filter((id) => !NEURO_COMBO_PARTS.has(id));
}

/** Selecting the combo clears its parts; selecting a part clears the combo. */
export function applyNeuroToggle(previous: string[], next: string[]): string[] {
  const added = next.find((id) => !previous.includes(id));
  if (added === NEURO_COMBO) return next.filter((id) => !NEURO_COMBO_PARTS.has(id));
  if (added && NEURO_COMBO_PARTS.has(added)) return next.filter((id) => id !== NEURO_COMBO);
  return settleNeuro(next);
}

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
  return { neuro: settleNeuro(neuroOut), vibe: vibeOut };
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

export function hintForTag(
  kind: "neuro" | "vibe",
  id: string,
  catalog: { neuro?: CatalogItem[]; vibe?: CatalogItem[] },
): string | undefined {
  const list = kind === "neuro" ? catalog.neuro : catalog.vibe;
  return list?.find((entry) => entry.id === id)?.hint || undefined;
}
