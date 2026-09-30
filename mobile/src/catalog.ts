import { useEffect, useState } from "react";
import { endpoints } from "./api/client";

let labels: Record<string, string> | null = null;
let pending: Promise<void> | null = null;

function load(): Promise<void> {
  pending ??= endpoints
    .catalog()
    .then((c) => {
      labels = {};
      for (const list of [c.neuro, c.vibe, c.intents]) {
        for (const item of list || []) labels[item.id] = item.label || item.name || item.id;
      }
    })
    .catch(() => {
      pending = null;
    });
  return pending;
}

/** id → human label for neuro/vibe/intent tags; falls back to the raw id. */
export function useTagLabel(): (id: string) => string {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!labels) load().then(() => bump((n) => n + 1));
  }, []);
  return (id) => labels?.[id] || id;
}
