import { Tabs } from "expo-router";
import { useTheme } from "../../src/theme";

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.accent,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="feed" options={{ title: "Лента", tabBarIcon: () => null }} />
      <Tabs.Screen name="likes" options={{ title: "Лайки", tabBarIcon: () => null }} />
      <Tabs.Screen name="chats" options={{ title: "Чаты", tabBarIcon: () => null }} />
      <Tabs.Screen name="profile" options={{ title: "Профиль", tabBarIcon: () => null }} />
    </Tabs>
  );
}
