import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import { useTheme } from "../src/theme";
import { Button, ErrorText, Field } from "../src/ui/kit";

export default function Login() {
  const t = useTheme();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await login(email, password);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: "center" }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: t.text, fontSize: 34, fontWeight: "800", letterSpacing: 2 }}>WIRING</Text>
          <Text style={{ color: t.muted, fontSize: 16, marginTop: 4, marginBottom: 28 }}>
            Знакомства для нейроотличных. В своём ритме.
          </Text>
          <Field label="Почта" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Пароль" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} />
          <ErrorText>{error}</ErrorText>
          <Button title="Войти" onPress={submit} busy={busy} disabled={!email || !password} />
          <View style={{ height: 12 }} />
          <Link href="/register" asChild>
            <Button title="Создать аккаунт" kind="ghost" onPress={() => {}} />
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
