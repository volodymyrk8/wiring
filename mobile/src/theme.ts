import { Platform, useColorScheme, type ViewStyle } from "react-native";

const light = {
  bg: "#f6f5fc",
  card: "#ffffff",
  text: "#15142a",
  muted: "#75738f",
  accent: "#6d5efc",
  accent2: "#a878ff",
  accentText: "#ffffff",
  border: "#e7e5f4",
  danger: "#e5484d",
  chip: "#efedfd",
  success: "#2fb67c",
  glass: "rgba(20,18,40,0.38)",
  isDark: false,
};

const dark: typeof light = {
  bg: "#0d0c1a",
  card: "#1a1931",
  text: "#f3f2ff",
  muted: "#9694b3",
  accent: "#8b7dff",
  accent2: "#c093ff",
  accentText: "#ffffff",
  border: "#2b2a48",
  danger: "#ff6b70",
  chip: "#25244a",
  success: "#45d199",
  glass: "rgba(0,0,0,0.45)",
  isDark: true,
};

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === "dark" ? dark : light);

export const radius = { sm: 12, md: 18, lg: 26, pill: 999 };

export function shadow(level: 1 | 2 | 3 = 1): ViewStyle {
  const o = [0, 0.08, 0.12, 0.18][level];
  return Platform.select<ViewStyle>({
    ios: { shadowColor: "#2a1f6b", shadowOpacity: o, shadowRadius: 8 + level * 6, shadowOffset: { width: 0, height: 4 + level * 2 } },
    default: { elevation: level * 3 },
  }) as ViewStyle;
}
