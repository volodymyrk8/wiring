import { tr } from "./i18n";
import type { PlaceBlock } from "@/features/profile/types";

export function countryForCity(city: string, places: PlaceBlock[]): string {
  const trimmed = city.trim();
  if (!trimmed) return "";
  const qualified = trimmed.split(" · ").at(-1);
  return places.find((place) => place.cities.includes(trimmed) || (trimmed.includes(" · ") && place.country === qualified))?.country || "";
}

export type CitySearchIndex = Record<string, string[]>;

export function cityOptionSearchText(city: string, citySearch?: CitySearchIndex): string {
  const keys = citySearch?.[city];
  return keys?.length ? keys.join(" ") : city;
}

export function countrySelectOptions(
  places: PlaceBlock[],
  countrySearch?: CitySearchIndex,
  empty?: { value: string; label: string },
) {
  const head = empty ? [empty] : [];
  return [
    ...head,
    ...places.map((place) => ({
      value: place.country,
      label: tr(place.country),
      searchText: [place.country, tr(place.country), ...(countrySearch?.[place.country] || [])].join(" "),
    })),
  ];
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

/** Retain a city only if it still belongs to the selected country. */
export function withCountry<T extends { city: string; country?: string }>(filters: T, country: string, places: PlaceBlock[]): T {
  return { ...filters, country, city: !country || countryForCity(filters.city, places) === country ? filters.city : "" };
}
