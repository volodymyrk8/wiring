import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { defaultFilters, normalizeFilters, type Filters } from "./filtersCore";

export { activeFilterCount, defaultFilters, filtersQuery, normalizeFilters, type Filters } from "./filtersCore";

const KEY = "wiring.filters.v1";

let current: Filters = defaultFilters();
const listeners = new Set<() => void>();

export const getFilters = (): Filters => current;

export function setFilters(next: Filters): Filters {
  current = normalizeFilters(next);
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => undefined);
  return current;
}

export async function loadFilters(): Promise<Filters> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      current = normalizeFilters(JSON.parse(raw));
      listeners.forEach((l) => l());
    }
  } catch {
    // keep defaults
  }
  return current;
}

export function useFilters(): Filters {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
