import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "../theme";

export function Button({ title, onPress, kind = "primary", disabled, busy }: {
  title: string; onPress: () => void; kind?: "primary" | "ghost" | "danger"; disabled?: boolean; busy?: boolean;
}) {
  const t = useTheme();
  const bg = kind === "primary" ? t.accent : "transparent";
  const fg = kind === "primary" ? t.accentText : kind === "danger" ? t.danger : t.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || busy}
      onPress={onPress}
      style={[s.btn, { backgroundColor: bg, borderColor: kind === "primary" ? bg : t.border, opacity: disabled ? 0.5 : 1 }]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const t = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: t.muted, marginBottom: 4, fontSize: 13 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.muted}
        {...rest}
        style={[s.input, { color: t.text, backgroundColor: t.card, borderColor: t.border }, style]}
      />
    </View>
  );
}

export function Chip({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={[s.chip, { backgroundColor: t.chip }]}>
      <Text style={{ color: t.text, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  const t = useTheme();
  return children ? <Text style={{ color: t.danger, marginBottom: 8 }}>{children}</Text> : null;
}

export function Empty({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <Text style={{ color: t.muted, textAlign: "center", fontSize: 16 }}>{text}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}

const s = StyleSheet.create({
  btn: { minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  btnText: { fontSize: 16, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginBottom: 6 },
});
