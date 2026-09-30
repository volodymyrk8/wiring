import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { mediaUrl } from "../api/client";
import { radius, shadow, useTheme } from "../theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

export function Button({ title, onPress, kind = "primary", disabled, busy, icon, style }: {
  title: string; onPress: () => void; kind?: "primary" | "soft" | "ghost" | "danger"; disabled?: boolean; busy?: boolean; icon?: IconName; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const fg = kind === "primary" ? t.accentText : kind === "danger" ? t.danger : t.accent;
  const content = busy ? (
    <ActivityIndicator color={fg} />
  ) : (
    <View style={s.row}>
      {icon && <Ionicons name={icon} size={20} color={fg} style={{ marginRight: 8 }} />}
      <Text style={[s.btnText, { color: fg }]}>{title}</Text>
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || busy}
      onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => [{ opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}
    >
      {kind === "primary" ? (
        <LinearGradient colors={[t.accent, t.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.btn, shadow(2)]}>{content}</LinearGradient>
      ) : (
        <View style={[s.btn, { backgroundColor: kind === "soft" ? t.chip : "transparent", borderWidth: kind === "ghost" ? 1 : 0, borderColor: t.border }]}>{content}</View>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string; icon?: IconName }) {
  const t = useTheme();
  const { label, icon, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[s.label, { color: t.muted }]}>{label}</Text>
      <View style={[s.inputWrap, { backgroundColor: t.card, borderColor: t.border }]}>
        {icon && <Ionicons name={icon} size={18} color={t.muted} style={{ marginRight: 10 }} />}
        <TextInput accessibilityLabel={label} placeholderTextColor={t.muted} {...rest} style={[{ flex: 1, color: t.text, fontSize: 16, paddingVertical: 14 }, style]} />
      </View>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const t = useTheme();
  const body = (
    <View style={[s.chip, { backgroundColor: selected ? t.accent : t.chip }]}>
      <Text style={{ color: selected ? t.accentText : t.text, fontSize: 13.5, fontWeight: selected ? "700" : "500" }}>{label}</Text>
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={() => { tap(); onPress(); }}>{body}</Pressable>
  ) : body;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: radius.lg, padding: 16 }, shadow(1), style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.muted, fontSize: 13, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8, marginTop: 8 }}>{children}</Text>;
}

export function Row({ icon, title, subtitle, onPress, right, danger }: {
  icon: IconName; title: string; subtitle?: string; onPress?: () => void; right?: ReactNode; danger?: boolean;
}) {
  const t = useTheme();
  const color = danger ? t.danger : t.text;
  return (
    <Pressable accessibilityRole="button" disabled={!onPress} onPress={() => { tap(); onPress?.(); }} style={({ pressed }) => [s.listRow, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[s.iconBubble, { backgroundColor: danger ? t.danger + "22" : t.chip }]}>
        <Ionicons name={icon} size={19} color={danger ? t.danger : t.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color, fontSize: 16, fontWeight: "600" }}>{title}</Text>
        {!!subtitle && <Text style={{ color: t.muted, fontSize: 13, marginTop: 1 }}>{subtitle}</Text>}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={t.muted} /> : null)}
    </Pressable>
  );
}

export function Toggle({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  const t = useTheme();
  return <Switch value={value} onValueChange={(v) => { tap(); onValueChange(v); }} trackColor={{ true: t.accent, false: t.border }} />;
}

export function Avatar({ uri, name, size = 52, online }: { uri?: string; name?: string; size?: number; online?: boolean }) {
  const t = useTheme();
  return (
    <View>
      {uri ? (
        <Image source={{ uri: mediaUrl(uri) }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.chip }} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.chip, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: t.accent, fontWeight: "800", fontSize: size / 2.6 }}>{(name || "?").slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      {online && <View style={{ position: "absolute", right: 0, bottom: 0, width: size / 4, height: size / 4, borderRadius: size / 8, backgroundColor: t.success, borderWidth: 2, borderColor: t.card }} />}
    </View>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  const t = useTheme();
  return children ? <Text style={{ color: t.danger, marginBottom: 10, fontSize: 14 }}>{children}</Text> : null;
}

export function Empty({ icon = "sparkles-outline", title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <View style={[s.emptyIcon, { backgroundColor: t.chip }]}>
        <Ionicons name={icon} size={34} color={t.accent} />
      </View>
      <Text style={{ color: t.text, fontSize: 20, fontWeight: "700", textAlign: "center" }}>{title}</Text>
      {!!text && <Text style={{ color: t.muted, textAlign: "center", fontSize: 15, marginTop: 6, lineHeight: 21 }}>{text}</Text>}
      {action && <View style={{ marginTop: 20, alignSelf: "stretch" }}>{action}</View>}
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
      <ActivityIndicator color={t.accent} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  btn: { minHeight: 52, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  btnText: { fontSize: 16, fontWeight: "700" },
  label: { marginBottom: 6, fontSize: 13, fontWeight: "600" },
  inputWrap: { flexDirection: "row", alignItems: "center", borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 14 },
  chip: { borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 7, marginRight: 8, marginBottom: 8 },
  listRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  iconBubble: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 12 },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", marginBottom: 18 },
});
