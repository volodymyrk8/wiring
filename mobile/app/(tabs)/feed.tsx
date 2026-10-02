import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { endpoints } from "../../src/api/client";
import type { Person } from "../../src/api/types";
import { getFilters, setFilters, useFilters, activeFilterCount, type Filters } from "../../src/filters";
import { useTheme } from "../../src/theme";
import { FilterButton, FiltersSheet } from "../../src/ui/FiltersSheet";
import { Glass, GlassGroup } from "../../src/ui/glass";
import { Button, Empty, ErrorText, Loading, tap } from "../../src/ui/kit";
import { defaultFilters } from "../../src/filtersCore";
import { Column, useGutter, useLayout, useTabBarInset } from "../../src/ui/layout";
import { MatchModal } from "../../src/ui/MatchModal";
import { ScreenHeader } from "../../src/ui/ScreenHeader";
import { SwipeCard, type SwipeCardHandle, type SwipeDirection } from "../../src/ui/SwipeCard";

const UNDO_WINDOW_MS = 5000;
const normalizeReset = () => defaultFilters();

export default function Feed() {
  const t = useTheme();
  const router = useRouter();
  const { compact } = useLayout();
  const tabInset = useTabBarInset();
  const gutter = useGutter();
  const [queue, setQueue] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [match, setMatch] = useState<Person | null>(null);
  const [undo, setUndo] = useState<Person | null>(null);
  const seen = useRef<number[]>([]);
  const card = useRef<SwipeCardHandle>(null);
  const busy = useRef(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nonce, setNonce] = useState(0);
  const filters = useFilters();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const requestId = useRef(0);

  // State is only touched inside promise callbacks, never synchronously from an effect.
  // `requestId` drops responses that belong to an earlier filter set.
  const load = useCallback(() => {
    const id = ++requestId.current;
    return endpoints
      .feed(seen.current, getFilters())
      .then((page) => {
        if (id !== requestId.current) return;
        setError("");
        setQueue((q) => [...q, ...page.cards.filter((c) => !seen.current.includes(c.id) && !q.some((x) => x.id === c.id))]);
        setHasMore(page.has_more);
      })
      .catch((e: Error) => {
        if (id === requestId.current) setError(e.message);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, []);

  const applyFilters = (next: Filters) => {
    setFilters(next);
    setFiltersOpen(false);
    setQueue([]);
    setHasMore(true);
    setLoading(true);
    void load();
  };

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const current = queue[0];

  useEffect(() => {
    if (!loading && hasMore && queue.length <= 2) void load();
  }, [queue.length, hasMore, loading, load]);

  const armUndo = (person: Person) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(person);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
  };

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
          setUndo(null);
          setMatch(person);
        } else if (direction === "like") {
          armUndo(person);
        } else {
          setUndo(null);
        }
      } catch (e: any) {
        Alert.alert("Не получилось", e.message);
        setNonce((n) => n + 1); // remount so the card returns after a failed swipe
      } finally {
        busy.current = false;
      }
    },
    [queue],
  );

  async function undoLike() {
    tap();
    try {
      const res = await endpoints.rewind();
      setUndo(null);
      if (res.card) {
        seen.current = seen.current.filter((id) => id !== res.card!.id);
        setQueue((q) => [res.card as Person, ...q.filter((x) => x.id !== res.card!.id)]);
        setNonce((n) => n + 1);
      }
    } catch (e: any) {
      setUndo(null);
      Alert.alert("Отменить не получилось", e.message);
    }
  }

  const matchModal = (
    <MatchModal
        person={match}
        onClose={() => setMatch(null)}
        onWrite={() => {
          const id = match?.id;
          setMatch(null);
          if (id) router.push(`/chat/${id}`);
        }}
      />
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ScreenHeader title="Лента" right={<FilterButton filters={filters} onPress={() => setFiltersOpen(true)} />} />
        <Loading />
        {filtersOpen && <FiltersSheet value={filters} onApply={applyFilters} onClose={() => setFiltersOpen(false)} />}
      </View>
    );
  }
  if (!current) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ScreenHeader title="Лента" right={<FilterButton filters={filters} onPress={() => setFiltersOpen(true)} />} />
        <ErrorText>{error}</ErrorText>
        <Empty
          icon="planet-outline"
          title={hasMore ? "Ищем людей…" : activeFilterCount(filters) ? "Никого по фильтрам" : "Пока всё"}
          text={hasMore ? undefined : activeFilterCount(filters) ? "Попробуй расширить возраст или убрать часть фильтров." : "Загляни позже — лента обновится. А пока можно улучшить свою анкету."}
          action={
            <View style={{ gap: 8 }}>
              {activeFilterCount(filters) > 0 && <Button title="Сбросить фильтры" icon="close-circle-outline" onPress={() => applyFilters(normalizeReset())} />}
              <Button title="Обновить" kind="soft" icon="refresh" onPress={() => { setLoading(true); load(); }} />
            </View>
          }
        />
        {filtersOpen && <FiltersSheet value={filters} onApply={applyFilters} onClose={() => setFiltersOpen(false)} />}
        {matchModal}
      </View>
    );
  }

  const size = compact ? { pass: 54, like: 64 } : { pass: 62, like: 74 };
  const round = (name: "close" | "heart", color: string, dir: SwipeDirection, px: number, label: string) => (
    <Glass radius={px / 2} interactive style={{ width: px, height: px }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => { tap(); card.current?.fling(dir); }}
        style={({ pressed }) => ({ flex: 1, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
      >
        <Ionicons name={name} size={px * 0.48} color={color} />
      </Pressable>
    </Glass>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader title="Лента" right={<FilterButton filters={filters} onPress={() => setFiltersOpen(true)} />} />
      <Column style={{ paddingHorizontal: gutter - 4, paddingBottom: tabInset }}>
        <View style={{ flex: 1 }}>
          <SwipeCard key={`${current.id}-${nonce}`} ref={card} person={current} onSwiped={onSwiped} onInfo={() => router.push(`/person/${current.id}`)} />
          {undo && (
            <View pointerEvents="box-none" style={{ position: "absolute", top: 12, alignSelf: "center" }}>
              <Glass radius={22} interactive>
                <Pressable accessibilityRole="button" accessibilityLabel={`Отменить лайк ${undo.name}`} onPress={undoLike} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 11 }}>
                  <Ionicons name="arrow-undo" size={18} color={t.accent} />
                  <Text style={{ color: t.text, fontWeight: "700", marginLeft: 8 }}>Лайк отправлен · Отменить</Text>
                </Pressable>
              </Glass>
            </View>
          )}
        </View>
        <GlassGroup spacing={24} style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: compact ? 22 : 30, paddingVertical: compact ? 8 : 14 }}>
          {round("close", t.danger, "pass", size.pass, "Пропустить")}
          {round("heart", t.success, "like", size.like, "Нравится")}
        </GlassGroup>
      </Column>
      {filtersOpen && <FiltersSheet value={filters} onApply={applyFilters} onClose={() => setFiltersOpen(false)} />}
      {matchModal}
    </View>
  );
}
