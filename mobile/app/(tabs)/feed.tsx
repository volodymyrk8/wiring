import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { endpoints } from "../../src/api/client";
import type { Person } from "../../src/api/types";
import { shadow, useTheme } from "../../src/theme";
import { Button, Empty, ErrorText, Loading, tap } from "../../src/ui/kit";
import { SwipeCard, type SwipeCardHandle, type SwipeDirection } from "../../src/ui/SwipeCard";

export default function Feed() {
  const t = useTheme();
  const router = useRouter();
  const [queue, setQueue] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const seen = useRef<number[]>([]);
  const card = useRef<SwipeCardHandle>(null);
  const busy = useRef(false);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    setError("");
    try {
      const page = await endpoints.feed(seen.current);
      setQueue((q) => [...q, ...page.cards.filter((c) => !seen.current.includes(c.id) && !q.some((x) => x.id === c.id))]);
      setHasMore(page.has_more);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const current = queue[0];

  useEffect(() => {
    if (!loading && hasMore && queue.length <= 2) load();
  }, [queue.length, hasMore, loading, load]);

  const onSwiped = useCallback(
    async (direction: SwipeDirection) => {
      const person = queue[0];
      if (!person || busy.current) return;
      busy.current = true;
      try {
        const res = await endpoints.swipe(person.id, direction);
        seen.current.push(person.id);
        setQueue((q) => q.slice(1));
        if (res.matched) {
          Alert.alert("Взаимный лайк 🎉", `Вы с ${person.name} понравились друг другу`, [
            { text: "Позже" },
            { text: "Написать", onPress: () => router.push(`/chat/${person.id}`) },
          ]);
        }
      } catch (e: any) {
        Alert.alert("Не получилось", e.message);
        setNonce((n) => n + 1); // remount so the card returns after a failed swipe
      } finally {
        busy.current = false;
      }
    },
    [queue, router],
  );

  if (loading) return <Loading />;
  if (!current) {
    return (
      <View style={{ flex: 1 }}>
        <ErrorText>{error}</ErrorText>
        <Empty
          icon="planet-outline"
          title={hasMore ? "Ищем людей…" : "Пока всё"}
          text={hasMore ? undefined : "Загляни позже — лента обновится. А пока можно улучшить свою анкету."}
          action={<Button title="Обновить" kind="soft" icon="refresh" onPress={() => { setLoading(true); load(); }} />}
        />
      </View>
    );
  }

  const round = (name: "close" | "heart", color: string, dir: SwipeDirection, size: number, label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => { tap(); card.current?.fling(dir); }}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.card, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.92 : 1 }] }, shadow(2)]}
    >
      <Ionicons name={name} size={size * 0.48} color={color} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 4 }}>
      <View style={{ flex: 1 }}>
        <SwipeCard key={`${current.id}-${nonce}`} ref={card} person={current} onSwiped={onSwiped} onInfo={() => router.push(`/person/${current.id}`)} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 28, paddingVertical: 14 }}>
        {round("close", t.danger, "pass", 62, "Пропустить")}
        {round("heart", t.success, "like", 72, "Нравится")}
      </View>
    </View>
  );
}
