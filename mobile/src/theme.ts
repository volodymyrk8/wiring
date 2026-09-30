import { useColorScheme } from "react-native";

const light = {
  bg: "#e9ebf3", card: "#ffffff", text: "#1d2030", muted: "#6b7085",
  accent: "#5b5bd6", accentText: "#ffffff", border: "#d7daea", danger: "#c8384d", chip: "#eef0fb",
};
const dark: typeof light = {
  bg: "#12141d", card: "#1c1f2c", text: "#eceefb", muted: "#9a9fb8",
  accent: "#8b8bf0", accentText: "#12141d", border: "#2c3040", danger: "#ee6a7c", chip: "#262a3b",
};

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === "dark" ? dark : light);
