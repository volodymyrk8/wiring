import { tr } from "./i18n";
import type { PlaceBlock } from "@/features/profile/types";

export function countryForCity(city: string, places: PlaceBlock[]): string {
  const trimmed = city.trim();
  if (!trimmed) return "";
  return places.find((place) => place.cities.includes(trimmed))?.country || "";
}

export type CitySearchIndex = Record<string, string[]>;

export function cityOptionSearchText(city: string, citySearch?: CitySearchIndex): string {
  const keys = citySearch?.[city];
  return keys?.length ? keys.join(" ") : city;
}

export function citySelectOptions(
  cities: string[],
  citySearch?: CitySearchIndex,
  empty?: { value: string; label: string },
) {
  const head = empty ? [empty] : [];
  return [
    ...head,
    ...cities.map((city) => ({
      value: city,
      label: tr(city),
      searchText: [tr(city), cityOptionSearchText(city, citySearch)].join(" "),
    })),
  ];
}

export function catalogCities(places: PlaceBlock[], country?: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const blocks = country ? places.filter((place) => place.country === country) : places;
  for (const place of blocks) {
    for (const city of place.cities) {
      if (!seen.has(city)) {
        seen.add(city);
        out.push(city);
      }
    }
  }
  return out;
}
