import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { endpoints } from "../../src/api/client";
import type { Match } from "../../src/api/types";
import { useTheme } from "../../src/theme";
import { Avatar, Empty, ErrorText, Loading } from "../../src/ui/kit";
import { Column, useTabBarInset } from "../../src/ui/layout";
import { ScreenHeader } from "../../src/ui/ScreenHeader";

function when(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export default function Chats() {
  const t = useTheme();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const tabInset = useTabBarInset();

  useFocusEffect(
    useCallback(() => {
      endpoints.matches().then((r) => { setMatches(r.matches); setError(""); }).catch((e) => setError(e.message));
    }, []),
  );

  const reload = async () => {
    setRefreshing(true);
    try {
      setMatches((await endpoints.matches()).matches);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  if (!matches) return error ? <ErrorText>{error}</ErrorText> : <Loading />;
  if (!matches.length) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ScreenHeader title="Чаты" />
        <Empty icon="chatbubbles-outline" title="Пока нет мэтчей" text="Когда вы с кем-то лайкнете друг друга, чат появится здесь." />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
    <ScreenHeader title="Чаты" />
    <Column>
    <FlatList
      data={matches}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={t.accent} />}
      keyExtractor={(m) => String(m.id)}
      contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 20 + tabInset }}
      renderItem={({ item }) => {
        const unread = !!item.unread;
        return (
          <Pressable
            onPress={() => router.push(`/chat/${item.id}`)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}
          >
            <Avatar uri={item.photo} name={item.name} size={60} online={item.online} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: t.text, fontWeight: "700", fontSize: 17 }}>{item.name}</Text>
                <Text style={{ color: unread ? t.accent : t.muted, fontSize: 12.5, fontWeight: unread ? "700" : "400" }}>{when(item.last_at)}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
                <Text numberOfLines={1} style={{ flex: 1, color: unread ? t.text : t.muted, fontWeight: unread ? "600" : "400", fontSize: 15 }}>
                  {item.last_message || "Напиши первым 👋"}
                </Text>
                {unread && (
                  <View style={{ backgroundColor: t.accent, borderRadius: 11, minWidth: 22, height: 22, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", marginLeft: 8 }}>
                    <Text style={{ color: t.accentText, fontSize: 12, fontWeight: "800" }}>{item.unread}</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        );
      }}
    />
    </Column>
    </View>
  );
}
