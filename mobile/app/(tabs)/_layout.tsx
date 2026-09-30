import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTheme } from "../../src/theme";

type Icon = React.ComponentProps<typeof Ionicons>["name"];
const icon = (on: Icon, off: Icon) => ({ focused, color }: { focused: boolean; color: import("react-native").ColorValue }) => (
  <Ionicons name={focused ? on : off} size={25} color={color} />
);

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "800", fontSize: 22 },
        headerTitleAlign: "left",
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="feed" options={{ title: "Лента", tabBarIcon: icon("flame", "flame-outline") }} />
      <Tabs.Screen name="likes" options={{ title: "Лайки", tabBarIcon: icon("heart", "heart-outline") }} />
      <Tabs.Screen name="chats" options={{ title: "Чаты", tabBarIcon: icon("chatbubbles", "chatbubbles-outline") }} />
      <Tabs.Screen name="profile" options={{ title: "Профиль", tabBarIcon: icon("person-circle", "person-circle-outline") }} />
    </Tabs>
  );
}
