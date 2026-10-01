import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCatalog } from "../catalog";
import { activeFilterCount, defaultFilters, normalizeFilters, type Filters } from "../filtersCore";
import { useTheme } from "../theme";
import { CityPicker } from "./CityPicker";
import { Glass } from "./glass";
import { Button, Card, Chip, Field, Loading, Row, SectionTitle, Toggle, tap } from "./kit";
import { MAX_CONTENT_WIDTH } from "./layout";

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

/** Round glass button with a count badge; put it in a ScreenHeader's `right` slot. */
export function FilterButton({ filters, onPress }: { filters: Filters; onPress: () => void }) {
  const t = useTheme();
  const n = activeFilterCount(filters);
  return (
    <View>
      <Glass radius={22} interactive style={{ width: 44, height: 44 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={n ? `Фильтры, применено: ${n}` : "Фильтры"}
          onPress={() => { tap(); onPress(); }}
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="options" size={22} color={t.accent} />
        </Pressable>
      </Glass>
      {n > 0 && (
        <View style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: t.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
          <Text style={{ color: t.accentText, fontSize: 11, fontWeight: "800" }}>{n}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * Filters sheet, same options as the web feed: age, city, meeting format, diagnoses, vibe and
 * "hide profiles without a diagnosis". Mount it only while open so its draft resets each time.
 */
export function FiltersSheet({ value, onApply, onClose }: { value: Filters; onApply: (f: Filters) => void; onClose: () => void }) {
  const t = useTheme();
  const catalog = useCatalog();
  const [draft, setDraft] = useState<Filters>(value);
  const [minText, setMinText] = useState(String(value.min_age));
  const [maxText, setMaxText] = useState(String(value.max_age));
  const [cityOpen, setCityOpen] = useState(false);

  const set = <K extends keyof Filters>(key: K, v: Filters[K]) => setDraft((d) => ({ ...d, [key]: v }));
  const chips = (items: { id: string; label?: string; name?: string }[] | undefined, key: "neuro" | "vibe" | "intents") => (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {(items || []).map((i) => <Chip key={i.id} label={i.label || i.name || i.id} selected={draft[key].includes(i.id)} onPress={() => set(key, toggle(draft[key], i.id))} />)}
    </View>
  );

  const apply = () => onApply(normalizeFilters({ ...draft, min_age: Number(minText), max_age: Number(maxText) }));
  const reset = () => {
    const d = defaultFilters();
    setDraft(d);
    setMinText(String(d.min_age));
    setMaxText(String(d.max_age));
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 }}>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: 26, fontWeight: "800" }}>Фильтры</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={12}>
            <Ionicons name="close-circle" size={30} color={t.muted} />
          </Pressable>
        </View>
        {!catalog ? (
          <Loading />
        ) : (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, width: "100%", maxWidth: MAX_CONTENT_WIDTH, alignSelf: "center" }} keyboardShouldPersistTaps="handled">
              <SectionTitle>Возраст</SectionTitle>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}><Field label="От" value={minText} onChangeText={(v) => setMinText(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={2} /></View>
                <View style={{ flex: 1 }}><Field label="До" value={maxText} onChangeText={(v) => setMaxText(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={2} /></View>
              </View>

              <Card style={{ marginBottom: 8 }}>
                <Row icon="location-outline" title="Город" subtitle={draft.city || "Любой"} onPress={() => setCityOpen(true)} />
              </Card>

              <SectionTitle>Формат знакомства</SectionTitle>
              {chips(catalog.intents, "intents")}
              <SectionTitle>Диагнозы</SectionTitle>
              {chips(catalog.neuro, "neuro")}
              <Card style={{ marginVertical: 12 }}>
                <Row icon="eye-off-outline" title="Скрыть анкеты без диагноза" right={<Toggle value={draft.hide_undiagnosed} onValueChange={(v) => set("hide_undiagnosed", v)} />} />
              </Card>
              <SectionTitle>Вайб</SectionTitle>
              {chips(catalog.vibe, "vibe")}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10, padding: 16, paddingBottom: 24, width: "100%", maxWidth: MAX_CONTENT_WIDTH, alignSelf: "center" }}>
              <View style={{ flex: 1 }}><Button title="Сбросить" kind="soft" onPress={reset} /></View>
              <View style={{ flex: 1.3 }}><Button title="Показать" icon="checkmark" onPress={apply} /></View>
            </View>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
      <CityPicker visible={cityOpen} allowAny places={catalog?.places || []} onClose={() => setCityOpen(false)} onPick={(c) => { set("city", c); setCityOpen(false); }} />
    </Modal>
  );
}
