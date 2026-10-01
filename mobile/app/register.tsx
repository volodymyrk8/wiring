import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useAuth } from "../src/auth";
import { useTheme } from "../src/theme";
import { Ionicons } from "@expo/vector-icons";
import { Button, ErrorText, Field } from "../src/ui/kit";

function Check({ on, set, text }: { on: boolean; set: (v: boolean) => void; text: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => set(!on)} style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
      <View style={{ width: 26, height: 26, borderRadius: 9, borderWidth: 2, borderColor: t.accent, backgroundColor: on ? t.accent : "transparent", marginRight: 12, alignItems: "center", justifyContent: "center" }}>{on && <Ionicons name="checkmark" size={17} color="#fff" />}</View>
      <Text style={{ color: t.text, flex: 1 }}>{text}</Text>
    </Pressable>
  );
}

export default function Register() {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adult, setAdult] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await register(name, email, password);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 24, width: "100%", maxWidth: 480, alignSelf: "center" }} keyboardShouldPersistTaps="handled">
        <Field label="Имя (2–32 символа)" icon="person-outline" value={name} onChangeText={setName} />
        <Field label="Почта" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Пароль (минимум 6 символов)" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry />
        <Check on={adult} set={setAdult} text="Мне есть 18 лет" />
        <Check on={privacy} set={setPrivacy} text="Согласен на обработку персональных данных и с политикой конфиденциальности" />
        <ErrorText>{error}</ErrorText>
        <Button title="Зарегистрироваться" onPress={submit} busy={busy} disabled={!adult || !privacy || name.trim().length < 2 || !email || password.length < 6} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
