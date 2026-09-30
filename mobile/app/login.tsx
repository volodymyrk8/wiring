import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <LinearGradient colors={[t.accent, t.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 300, borderBottomLeftRadius: 44, borderBottomRightRadius: 44 }}>
        <SafeAreaView style={{ flex: 1, justifyContent: "flex-end", paddingHorizontal: 28, paddingBottom: 34 }}>
          <View style={{ width: 54, height: 54, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Ionicons name="flash" size={28} color="#fff" />
          </View>
          <Text style={{ color: "#fff", fontSize: 38, fontWeight: "900", letterSpacing: 3 }}>WIRING</Text>
          <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 16, marginTop: 4 }}>Знакомства для нейроотличных. В своём ритме.</Text>
        </SafeAreaView>
      </LinearGradient>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
          <Field label="Почта" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Пароль" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} />
          <ErrorText>{error}</ErrorText>
          <Button title="Войти" onPress={submit} busy={busy} disabled={!email || !password} />
          <View style={{ height: 10 }} />
          <Link href="/register" asChild>
            <Button title="Создать аккаунт" kind="soft" onPress={() => {}} />
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
