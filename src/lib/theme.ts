const COLORS = {
  mist: "#e9ebf3", pastel: "#f3eee6", dusk: "#1a1c24", night: "#110e0c", slate: "#0b0f14",
} as const;
export function themeNow(): keyof typeof COLORS {
  const theme = document.documentElement.dataset.theme || "mist";
  return Object.hasOwn(COLORS, theme) ? theme as keyof typeof COLORS : "mist";
}
export function applyTheme(theme: string) {
  const next = Object.hasOwn(COLORS, theme) ? theme as keyof typeof COLORS : "mist";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("wiring-theme", next); } catch { /* Storage may be unavailable. */ }
  document.cookie = `wiring-theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = COLORS[next];
  });
}
