// Pure filter logic: no React Native imports, so it runs under `node --test`.
/** Same fields as the web feed filters. */
export type Filters = {
  neuro: string[];
  vibe: string[];
  intents: string[];
  min_age: number;
  max_age: number;
  city: string;
  hide_undiagnosed: boolean;
};

export const defaultFilters = (): Filters => ({ neuro: [], vibe: [], intents: [], min_age: 18, max_age: 99, city: "", hide_undiagnosed: true });

const clampAge = (n: unknown, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(18, Math.min(99, v)) : fallback;
};

/** Defensive parse: stored or user-edited values never break the query. */
export function normalizeFilters(raw: Partial<Filters> | null | undefined): Filters {
  const base = defaultFilters();
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  let min = clampAge(raw?.min_age, base.min_age);
  let max = clampAge(raw?.max_age, base.max_age);
  if (min > max) [min, max] = [max, min];
  return {
    neuro: list(raw?.neuro),
    vibe: list(raw?.vibe),
    intents: list(raw?.intents),
    min_age: min,
    max_age: max,
    city: typeof raw?.city === "string" ? raw.city : "",
    hide_undiagnosed: raw?.hide_undiagnosed !== false,
  };
}

/** Query string for /api/feed and /api/likes. Default values are omitted. */
export function filtersQuery(f: Filters): string {
  const q: string[] = [];
  const add = (k: string, v: string) => q.push(`${k}=${encodeURIComponent(v)}`);
  if (f.neuro.length) add("neuro", f.neuro.join(","));
  if (f.vibe.length) add("vibe", f.vibe.join(","));
  if (f.intents.length) add("intent", f.intents.join(","));
  if (f.min_age > 18) add("min_age", String(f.min_age));
  if (f.max_age < 99) add("max_age", String(f.max_age));
  if (f.city) add("city", f.city);
  if (!f.hide_undiagnosed) add("hide_empty", "0");
  return q.join("&");
}

/** How many filters differ from the defaults (for the badge on the filter button). */
export function activeFilterCount(f: Filters): number {
  const d = defaultFilters();
  return (
    (f.neuro.length ? 1 : 0) +
    (f.vibe.length ? 1 : 0) +
    (f.intents.length ? 1 : 0) +
    (f.min_age !== d.min_age || f.max_age !== d.max_age ? 1 : 0) +
    (f.city ? 1 : 0) +
    (f.hide_undiagnosed !== d.hide_undiagnosed ? 1 : 0)
  );
}

