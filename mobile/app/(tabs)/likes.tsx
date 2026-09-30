import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { endpoints, mediaUrl } from "../../src/api/client";
import type { Person } from "../../src/api/types";
import { radius, shadow, useTheme } from "../../src/theme";
import { Empty, ErrorText, Loading } from "../../src/ui/kit";

export default function Likes() {
  const t = useTheme();
  const router = useRouter();
  const [likes, setLikes] = useState<Person[] | null>(null);
  const [plus, setPlus] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      endpoints.likes().then((r) => { setLikes(r.likes); setPlus(r.plus); setError(""); }).catch((e) => setError(e.message));
    }, []),
  );

  if (!likes) return error ? <ErrorText>{error}</ErrorText> : <Loading />;
  if (!likes.length) return <Empty icon="heart-outline" title="Пока никто не лайкнул" text="Заполни анкету и загляни в ленту, лайки появятся здесь." />;
  return (
    <FlatList
      data={likes}
      numColumns={2}
      keyExtractor={(p, i) => String(p.id ?? `h${i}`)}
      contentContainerStyle={{ padding: 10 }}
      ListHeaderComponent={
        <View style={{ padding: 6, paddingBottom: 10 }}>
          <Text style={{ color: t.muted, fontSize: 15 }}>
            {plus ? `Тебя лайкнули: ${likes.length}` : "Кто тебя лайкнул — доступно с WIRING+. Оформить пока можно на сайте wiring.date."}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          disabled={item.hidden}
          onPress={() => router.push(`/person/${item.id}`)}
          style={({ pressed }) => ({ flexBasis: "50%", maxWidth: "50%", opacity: pressed ? 0.85 : 1 })}
        >
          <View style={[{ margin: 6, borderRadius: radius.lg, overflow: "hidden", backgroundColor: t.card }, shadow(1)]}>
            {item.hidden ? (
              <View style={{ aspectRatio: 0.75, alignItems: "center", justifyContent: "center", backgroundColor: t.chip }}>
                <Ionicons name="lock-closed" size={26} color={t.accent} />
                <Text style={{ color: t.accent, fontWeight: "800", marginTop: 6 }}>WIRING+</Text>
              </View>
            ) : (
              <View style={{ aspectRatio: 0.75 }}>
                <Image source={{ uri: mediaUrl(item.photo) }} style={{ flex: 1 }} contentFit="cover" />
                <LinearGradient colors={["transparent", "rgba(10,8,30,0.8)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 90 }} />
                <Text style={{ position: "absolute", left: 12, bottom: 10, color: "#fff", fontWeight: "800", fontSize: 17 }}>
                  {item.name}{item.age ? `, ${item.age}` : ""}
                </Text>
              </View>
            )}
          </View>
        </Pressable>
      )}
    />
  );
}
