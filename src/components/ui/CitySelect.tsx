import { useEffect, useRef, useState } from "preact/hooks";
import { tr } from "@/lib/i18n";
import type { ApiClient } from "@/app/api";
import type { PlaceBlock } from "@/features/profile/types";
import { Select, type SelectProps, type SelectOption } from "./Select";
import { catalogCities, citySelectOptions } from "@/lib/places";

export function CitySelect({ api, places, country = "", includeCountries = false, emptyLabel = tr("Любой"), ...props }: Omit<SelectProps, "options"> & {
  api: ApiClient; places: PlaceBlock[]; country?: string; includeCountries?: boolean; emptyLabel?: string;
}) {
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => { setPending(false); setError(""); return () => { mutation.current?.abort(); mutation.current = null; }; }, [country]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<SelectOption[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    setRemote([]);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query, country, countries: includeCountries ? "1" : "0" });
      void api<{ places?: Array<{ value: string; label: string }> }>(`/api/places?${params}`, { signal: controller.signal }).then((data) => {
        if (!controller.signal.aborted) setRemote((data.places || []).map((item) => ({ ...item, searchText: `${item.label} ${query}` })));
      }).catch(() => { /* Curated suggestions and manual input remain available offline. */ });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, query, country, includeCountries]);
  const options: SelectOption[] = [{ value: "", label: emptyLabel },
    ...(includeCountries ? places.map((place) => ({ value: place.country, label: tr(place.country) })) : []),
    ...remote, ...citySelectOptions(catalogCities(places, country))];
  if (props.value && !options.some((option) => option.value === props.value)) options.push({ value: props.value, label: props.value });
  if (query.trim().length >= 2) options.push({ value: country ? `${query.trim()} · ${country}` : query.trim(), label: tr("Проверить «{0}» с ИИ", query.trim()), searchText: query });
  const seen = new Set<string>();
  return <div>
    <Select {...props} error={error || props.error} searchable onSearchChange={setQuery} onChange={(value) => {
      if (!value || places.some((place) => place.country === value || place.cities.includes(value))) {
        mutation.current?.abort(); mutation.current = null;
        setPending(false); setError(""); props.onChange?.(value); return;
      }
      if (mutation.current) return;
      const controller = new AbortController(); mutation.current = controller;
      setPending(true); setError("");
      void api<{ city: string }>("/api/places/resolve", { method: "POST", signal: controller.signal, body: JSON.stringify({ city: value, country }) }).then((data) => { if (!controller.signal.aborted) props.onChange?.(data.city); }).catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : tr("Проверь название города")); }).finally(() => { if (mutation.current === controller) mutation.current = null; if (!controller.signal.aborted) setPending(false); });
    }} options={options.filter((option) => !seen.has(option.value) && !!seen.add(option.value))} />
    {pending && <small role="status">{tr("Проверяем город…")}</small>}
  </div>;
}
