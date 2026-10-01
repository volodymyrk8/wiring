import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme";
import { useGutter, useLayout } from "./layout";

/** Large in-screen title for tab screens (native tabs have no navigation header). */
export function ScreenHeader({ title, right, subtitle }: { title: string; right?: ReactNode; subtitle?: string }) {
  const t = useTheme();
  const { insets, compact } = useLayout();
  const gutter = useGutter();
  return (
    <View style={{ paddingTop: insets.top + (compact ? 4 : 10), paddingHorizontal: gutter, paddingBottom: compact ? 6 : 10, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={{ color: t.text, fontSize: compact ? 28 : 32, fontWeight: "800", letterSpacing: -0.5 }}>{title}</Text>
        {!!subtitle && <Text style={{ color: t.muted, fontSize: 14, marginTop: 2 }}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}
