import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "../src/auth";
import { routeForPush } from "../src/push";
import { useTheme } from "../src/theme";
import { Button, Empty, Loading } from "../src/ui/kit";
import { Linking, View } from "react-native";
import { API_URL } from "../src/api/config";

function Gate() {
  const { user, loading, upgradeRequired } = useAuth();
  const t = useTheme();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const target = routeForPush(response?.notification.request.content.data?.url as string | undefined);
      if (target) router.push(target as any);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [user, router]);

  if (loading) return <Loading />;
  if (upgradeRequired) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Empty
          icon="cloud-download-outline"
          title="Нужно обновление"
          text={`Эта версия WIRING больше не поддерживается. Установи версию ${upgradeRequired} или новее.`}
          action={<Button title="Открыть сайт" onPress={() => Linking.openURL(API_URL)} />}
        />
      </View>
    );
  }
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerBackTitle: "Назад",
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]" options={{ title: "Чат" }} />
          <Stack.Screen name="person/[id]" options={{ title: "Профиль" }} />
          <Stack.Screen name="edit-profile" options={{ title: "Моя анкета" }} />
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
