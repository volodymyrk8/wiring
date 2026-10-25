import english from "../../locales/en.json";

export type Language = "ru" | "en";
const messages: Record<string, string> = english;
const KEY = "wiring-language";
export function getLanguage(): Language {
  if (typeof document !== "undefined") { const cookie = document.cookie.match(/(?:^|; )wiring-language=(ru|en)(?:;|$)/)?.[1]; if (cookie === "ru" || cookie === "en") return cookie; }
  try { const stored = localStorage.getItem(KEY); if (stored === "ru" || stored === "en") return stored; } catch { /* Private browsing. */ }
  return typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "ru";
}
export const getLocale = () => getLanguage() === "en" ? "en-US" : "ru-RU";
export function tr(source: string, ...values: unknown[]): string {
  const key = source.replace(/\s+/g, " ").trim();
  const translated = getLanguage() === "en" ? messages[key] : undefined;
  const text = translated === undefined ? source : (source.match(/^\s*/)?.[0] || "") + translated + (source.match(/\s*$/)?.[0] || "");
  return text.replace(/\{(\d+)\}/g, (match, index) => Number(index) < values.length ? String(values[Number(index)] ?? "") : match);
}
export function syncLanguage(language: unknown): boolean {
  if (language !== "ru" && language !== "en") return false;
  const changed = getLanguage() !== language;
  try { localStorage.setItem(KEY, language); } catch { /* Cookie remains available. */ }
  document.cookie = `wiring-language=${language}; Path=/; SameSite=Lax; Max-Age=31536000`;
  document.documentElement.lang = language;
  return changed;
}
export async function selectLanguage(language: Language): Promise<void> {
  if (!window.dispatchEvent(new Event("wiring:before-language-change", { cancelable: true }))) {
    throw new Error(tr("Заверши отправку или отмени запись и выбранные фото перед сменой языка."));
  }
  // Persist account preference before reloading. Guests keep the same device preference.
  const base = document.getElementById?.("app")?.dataset.base || "";
  const response = await fetch(`${base}/api/me/language`, {
    method: "PATCH", credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Wiring-Language": getLanguage() },
    body: JSON.stringify({ language }),
  });
  if (!response.ok && response.status !== 401) throw new Error(tr("Не удалось сохранить язык. Попробуй ещё раз."));
  try { if (response.status === 401) localStorage.setItem("wiring-language-pending", language); else localStorage.removeItem("wiring-language-pending"); } catch { /* Cookie preference still works. */ }
  syncLanguage(language);
  window.location.reload();
}

/** A language selected before sign-in also applies to the account just signed into. */
export async function syncAccountLanguage(user: { language?: unknown } | null): Promise<boolean> {
  if (!user) return false;
  let pending: string | null = null;
  try { pending = localStorage.getItem("wiring-language-pending"); } catch { /* Use account preference. */ }
  if (pending === "ru" || pending === "en") {
    try {
      const base = document.getElementById?.("app")?.dataset.base || "";
      const response = await fetch(`${base}/api/me/language`, {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: pending }),
      });
      if (!response.ok) return false;
      user.language = pending;
      localStorage.removeItem("wiring-language-pending");
    } catch { return false; }
  }
  return syncLanguage(user.language);
}
