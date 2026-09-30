import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { endpoints, mediaUrl } from "../../src/api/client";
import type { Match } from "../../src/api/types";
import { useTheme } from "../../src/theme";
import { Empty, ErrorText, Loading } from "../../src/ui/kit";

export default function Chats() {
  const t = useTheme();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      endpoints.matches().then((r) => { setMatches(r.matches); setError(""); }).catch((e) => setError(e.message));
    }, []),
  );

  if (!matches) return error ? <ErrorText>{error}</ErrorText> : <Loading />;
  if (!matches.length) return <Empty text="Пока нет взаимных лайков. Они появятся здесь." />;
  return (
    <FlatList
      data={matches}
      keyExtractor={(m) => String(m.id)}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push(`/chat/${item.id}`)} style={{ flexDirection: "row", padding: 14, alignItems: "center", borderBottomWidth: 1, borderBottomColor: t.border }}>
          <Image source={{ uri: mediaUrl(item.photo) }} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: t.chip }} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: t.text, fontWeight: "600", fontSize: 16 }}>{item.name}</Text>
            <Text numberOfLines={1} style={{ color: t.muted, marginTop: 2 }}>{item.last_message || "Напиши первым"}</Text>
          </View>
          {!!item.unread && (
            <View style={{ backgroundColor: t.accent, borderRadius: 12, minWidth: 24, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ color: t.accentText, textAlign: "center", fontWeight: "700" }}>{item.unread}</Text>
            </View>
          )}
        </Pressable>
      )}
    />
  );
}
