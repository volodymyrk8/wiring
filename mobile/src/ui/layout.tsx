import type { ReactNode } from "react";
import { Platform, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Widest comfortable column for phone-style UI on tablets, foldables and landscape. */
export const MAX_CONTENT_WIDTH = 560;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return {
    width,
    height,
    insets,
    /** Short phones (iPhone SE/mini class, split screen): tighten spacing and shrink controls. */
    compact: height < 700 || width < 360,
    /** Tablets, unfolded foldables, landscape. */
    wide: width > MAX_CONTENT_WIDTH + 80,
    contentWidth: Math.min(width, MAX_CONTENT_WIDTH),
  };
}

/** Centres content in a readable column on wide screens; a no-op on phones. */
export function Column({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.column, style]}>{children}</View>;
}

const s = StyleSheet.create({
  column: { flex: 1, width: "100%", maxWidth: MAX_CONTENT_WIDTH, alignSelf: "center" },
});

/**
 * The iOS tab bar floats over the content (Liquid Glass), so scrollable screens and pinned
 * controls need extra bottom space. Android's bottom navigation already insets its content.
 */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === "ios" ? insets.bottom + 62 : 0;
}
