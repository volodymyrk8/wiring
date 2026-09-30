import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { endpoints, mediaUrl } from "../../src/api/client";
import type { Person } from "../../src/api/types";
import { useTheme } from "../../src/theme";
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
  if (!likes.length) return <Empty text="Пока никто не лайкнул. Заполни анкету и загляни в ленту." />;
  return (
    <FlatList
      data={likes}
      numColumns={2}
      keyExtractor={(p, i) => String(p.id ?? `h${i}`)}
      contentContainerStyle={{ padding: 12 }}
      ListHeaderComponent={!plus ? <Text style={{ color: t.muted, padding: 4, marginBottom: 8 }}>Кто тебя лайкнул — доступно с WIRING+. Оформить пока можно на сайте wiring.date.</Text> : null}
      renderItem={({ item }) => (
        <Pressable
          disabled={item.hidden}
          onPress={() => router.push(`/person/${item.id}`)}
          style={{ flexBasis: "50%", maxWidth: "50%", padding: 0, margin: 0, borderWidth: 0, backgroundColor: "transparent" }}>
          <View style={{ margin: 6, borderRadius: 16, overflow: "hidden", backgroundColor: t.card, borderWidth: 1, borderColor: t.border }}>
          {item.hidden ? (
            <View style={{ aspectRatio: 0.8, alignItems: "center", justifyContent: "center", backgroundColor: t.chip }}>
              <Text style={{ color: t.muted }}>WIRING+</Text>
            </View>
          ) : (
            <>
              <Image source={{ uri: mediaUrl(item.photo) }} style={{ aspectRatio: 0.8 }} contentFit="cover" />
              <Text style={{ color: t.text, padding: 8, fontWeight: "600" }}>{item.name}{item.age ? `, ${item.age}` : ""}</Text>
            </>
          )}
          </View>
        </Pressable>
      )}
    />
  );
}
