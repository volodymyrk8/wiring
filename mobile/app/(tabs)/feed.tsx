import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { endpoints } from "../../src/api/client";
import type { Person } from "../../src/api/types";
import { Button, Empty, ErrorText, Loading } from "../../src/ui/kit";
import { PersonCard } from "../../src/ui/PersonCard";

export default function Feed() {
  const router = useRouter();
  const [queue, setQueue] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const seen = useRef<number[]>([]);

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

  // Prefetch the next page while the last few cards are on screen.
  useEffect(() => {
    if (!loading && hasMore && queue.length <= 2) load();
  }, [queue.length, hasMore, loading, load]);

  async function act(direction: "like" | "pass") {
    if (!current || busy) return;
    setBusy(true);
    try {
      const res = await endpoints.swipe(current.id, direction);
      seen.current.push(current.id);
      setQueue((q) => q.slice(1));
      if (res.matched) {
        Alert.alert("Взаимный лайк", `Вы с ${current.name} понравились друг другу`, [
          { text: "Позже" },
          { text: "Написать", onPress: () => router.push(`/chat/${current.id}`) },
        ]);
      }
    } catch (e: any) {
      Alert.alert("Не получилось", e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (!current) {
    return (
      <View style={{ flex: 1 }}>
        <ErrorText>{error}</ErrorText>
        <Empty text={hasMore ? "Ищем людей…" : "Пока всё. Загляни позже — лента обновится."} />
        <View style={{ padding: 16 }}>
          <Button title="Обновить" kind="ghost" onPress={() => { setLoading(true); load(); }} />
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <PersonCard person={current} />
        <View style={{ height: 8 }} />
        <Button title="Открыть профиль и пожаловаться" kind="ghost" onPress={() => router.push(`/person/${current.id}`)} />
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 12, padding: 16 }}>
        <View style={{ flex: 1 }}><Button title="Пропустить" kind="ghost" onPress={() => act("pass")} busy={busy} /></View>
        <View style={{ flex: 1 }}><Button title="Нравится" onPress={() => act("like")} busy={busy} /></View>
      </View>
    </View>
  );
}
