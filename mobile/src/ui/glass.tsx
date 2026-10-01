import { BlurView } from "expo-blur";
import { GlassContainer, GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";

/** Liquid Glass exists on iOS 26+. Everything else gets a blurred translucent fallback. */
export const hasLiquidGlass: boolean = (() => {
  if (Platform.OS !== "ios") return false;
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
})();

type GlassProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Corner radius; the glass is clipped to it. */
  radius?: number;
  /** Reacts to touch (iOS 26+). Use for tappable surfaces. */
  interactive?: boolean;
  tint?: string;
  strength?: "regular" | "clear";
};

/** A glass surface: native Liquid Glass on iOS 26+, blur or translucent card elsewhere. */
export function Glass({ children, style, radius = 22, interactive, tint, strength = "regular" }: GlassProps) {
  const t = useTheme();
  const shape: ViewStyle = { borderRadius: radius, overflow: "hidden" };
  if (hasLiquidGlass) {
    return (
      <GlassView glassEffectStyle={strength} isInteractive={interactive} tintColor={tint} colorScheme={t.isDark ? "dark" : "light"} style={[shape, style]}>
        {children}
      </GlassView>
    );
  }
  if (Platform.OS === "ios") {
    return (
      <BlurView intensity={55} tint={t.isDark ? "dark" : "light"} style={[shape, { borderWidth: StyleSheet.hairlineWidth, borderColor: t.border }, style]}>
        {children}
      </BlurView>
    );
  }
  return <View style={[shape, { backgroundColor: t.isDark ? "rgba(36,35,70,0.92)" : "rgba(255,255,255,0.92)", borderWidth: StyleSheet.hairlineWidth, borderColor: t.border }, style]}>{children}</View>;
}

/** Groups nearby glass elements so they blend into each other (iOS 26+). */
export function GlassGroup({ children, spacing = 16, style }: { children: ReactNode; spacing?: number; style?: StyleProp<ViewStyle> }) {
  if (!hasLiquidGlass) return <View style={style}>{children}</View>;
  return (
    <GlassContainer spacing={spacing} style={style}>
      {children}
    </GlassContainer>
  );
}
