import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { endpoints } from "../src/api/client";
import { useAuth } from "../src/auth";
import { useCatalog } from "../src/catalog";
import { useTheme } from "../src/theme";
import { CityPicker } from "../src/ui/CityPicker";
import { Button, Card, Chip, ErrorText, Field, Loading, Row, SectionTitle } from "../src/ui/kit";
import { MAX_CONTENT_WIDTH, useGutter } from "../src/ui/layout";

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
const clamp = (v: string, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && v !== "" ? Math.max(18, Math.min(99, n)) : fallback;
};

/** "Кому показывать мою анкету": the web's discovery settings. Saved as a partial (draft) PATCH. */
export default function Visibility() {
  const t = useTheme();
  const router = useRouter();
  const gutter = useGutter();
  const { user, setUser } = useAuth();
  const catalog = useCatalog();
  const [minText, setMinText] = useState(String(user?.seek_min_age ?? 18));
  const [maxText, setMaxText] = useState(String(user?.seek_max_age ?? 99));
  const [place, setPlace] = useState(user?.seek_place ?? "");
  const [hidden, setHidden] = useState<string[]>(user?.hide_tags ?? []);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!user || !catalog) return <Loading />;

  async function save() {
    let min = clamp(minText, 18);
    let max = clamp(maxText, 99);
    if (min > max) [min, max] = [max, min];
    setSaving(true);
    setError("");
    try {
      const res = await endpoints.saveProfile({ draft: true, seek_min_age: min, seek_max_age: max, seek_place: place, hide_tags: hidden });
      setUser(res.user);
      Alert.alert("Сохранено", "Настройки видимости обновлены.");
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const chips = (items: { id: string; label?: string; name?: string }[] | undefined) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {(items || []).map((i) => <Chip key={i.id} label={i.label || i.name || i.id} selected={hidden.includes(i.id)} onPress={() => setHidden((h) => toggle(h, i.id))} />)}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 40, width: "100%", maxWidth: MAX_CONTENT_WIDTH, alignSelf: "center" }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21, marginBottom: 8 }}>
          Анкету увидят только люди, подходящие под эти условия. Ты сам по-прежнему видишь всех по своим фильтрам.
        </Text>

        <SectionTitle>Возраст тех, кто может меня видеть</SectionTitle>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="От" value={minText} onChangeText={(v) => setMinText(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={2} /></View>
          <View style={{ flex: 1 }}><Field label="До" value={maxText} onChangeText={(v) => setMaxText(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={2} /></View>
        </View>

        <Card style={{ marginBottom: 8 }}>
          <Row icon="globe-outline" title="Откуда" subtitle={place || "Отовсюду"} onPress={() => setPlaceOpen(true)} />
        </Card>

        <SectionTitle>Не показывать меня людям с этими особенностями</SectionTitle>
        {chips(catalog.neuro)}
        <SectionTitle>Не показывать меня людям с таким вайбом</SectionTitle>
        {chips(catalog.vibe)}

        <View style={{ height: 12 }} />
        <ErrorText>{error}</ErrorText>
        <Button title="Сохранить" icon="checkmark" onPress={save} busy={saving} />
      </ScrollView>
      <CityPicker
        visible={placeOpen}
        allowAny
        anyLabel="Отовсюду"
        includeCountries
        title="Откуда"
        places={catalog.places || []}
        onClose={() => setPlaceOpen(false)}
        onPick={(p) => { setPlace(p); setPlaceOpen(false); }}
      />
    </KeyboardAvoidingView>
  );
}
