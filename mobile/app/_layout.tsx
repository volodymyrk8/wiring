import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../src/auth";
import { Loading } from "../src/ui/kit";
import { useTheme } from "../src/theme";

function Gate() {
  const { user, loading } = useAuth();
  const t = useTheme();

  if (loading) return <Loading />;
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerBackTitle: "Назад", headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]" options={{ title: "Чат" }} />
          <Stack.Screen name="person/[id]" options={{ title: "Профиль" }} />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ title: "Регистрация" }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
