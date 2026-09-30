import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { endpoints, mediaUrl } from "../src/api/client";
import type { Catalog, Me } from "../src/api/types";
import { useAuth } from "../src/auth";
import { radius, useTheme } from "../src/theme";
import { Button, Card, Chip, ErrorText, Field, Loading, Row, SectionTitle, Toggle } from "../src/ui/kit";

type Draft = {
  name: string; age: string; gender: string; looking_for: string; city: string; job: string; bio: string;
  neuro: string[]; vibe: string[]; intents: string[];
};

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

function fromUser(u: Me): Draft {
  return {
    name: u.name || "",
    age: u.age ? String(u.age) : "",
    gender: u.gender || "",
    looking_for: u.looking_for || "",
    city: u.city && u.city !== "—" ? u.city : "",
    job: u.job || "",
    bio: u.bio || "",
    neuro: u.neuro || [],
    vibe: u.vibe || [],
    intents: u.intents?.length ? u.intents : ["dating"],
  };
}

export default function EditProfile() {
  const t = useTheme();
  const router = useRouter();
  const { user, setUser, refresh } = useAuth();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [draft, setDraft] = useState<Draft | null>(user ? fromUser(user) : null);
  const [photos, setPhotos] = useState<{ id: number; url: string; is_primary?: boolean }[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [specialConsent, setSpecialConsent] = useState(!user?.needs_special_consent);
  const [photoConsent, setPhotoConsent] = useState(!user?.needs_photo_consent);

  useEffect(() => {
    endpoints.catalog().then(setCatalog).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const list = (user?.photos || []).filter((p): p is { id: number; url: string; is_primary?: boolean } => typeof p !== "string" && !!p.id);
    setPhotos(list);
  }, [user]);

  if (!user || !draft || !catalog) return <Loading />;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const maxPhotos = catalog.limits?.photos ?? 12;

  async function addPhoto() {
    if (!photoConsent) {
      Alert.alert("Только свои фото", "Включи переключатель «Загружаю только свои фото».");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: false });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setUploading(true);
    setError("");
    try {
      await endpoints.uploadPhoto(asset.uri, asset.mimeType || "image/jpeg", asset.fileName || "photo.jpg");
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function makePrimary(id: number) {
    try {
      await endpoints.primaryPhoto(id);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function removePhoto(id: number) {
    Alert.alert("Удалить фото?", "", [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: () => endpoints.deletePhoto(id).then(refresh).catch((e) => setError(e.message)) },
    ]);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const res = await endpoints.saveProfile({
        name: draft.name.trim(),
        age: Number(draft.age),
        gender: draft.gender,
        looking_for: draft.looking_for,
        city: draft.city,
        job: draft.job.trim(),
        bio: draft.bio.trim(),
        neuro: draft.neuro,
        vibe: draft.vibe,
        intents: draft.intents,
        special_data_consent: specialConsent,
        photo_rights_consent: photoConsent,
      });
      setUser(res.user);
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const options = (items: { id: string; label?: string }[] | undefined, selected: (id: string) => boolean, onPick: (id: string) => void) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {(items || []).map((i) => <Chip key={i.id} label={i.label || i.id} selected={selected(i.id)} onPress={() => onPick(i.id)} />)}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <SectionTitle>Фото</SectionTitle>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {photos.map((p) => (
            <View key={p.id} style={{ width: "31%", aspectRatio: 0.8, borderRadius: radius.md, overflow: "hidden", backgroundColor: t.chip }}>
              <Image source={{ uri: mediaUrl(p.url) }} style={{ flex: 1 }} contentFit="cover" />
              <Pressable accessibilityLabel="Удалить фото" onPress={() => removePhoto(p.id)} style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="close" size={16} color="#fff" />
              </Pressable>
              <Pressable accessibilityLabel="Сделать главным" onPress={() => !p.is_primary && makePrimary(p.id)} style={{ position: "absolute", left: 6, bottom: 6, borderRadius: 10, backgroundColor: p.is_primary ? t.accent : "rgba(0,0,0,0.55)", paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{p.is_primary ? "главное" : "сделать главным"}</Text>
              </Pressable>
            </View>
          ))}
          {photos.length < maxPhotos && (
            <Pressable accessibilityLabel="Добавить фото" onPress={addPhoto} style={{ width: "31%", aspectRatio: 0.8, borderRadius: radius.md, borderWidth: 2, borderStyle: "dashed", borderColor: t.accent, alignItems: "center", justifyContent: "center", backgroundColor: t.chip }}>
              <Ionicons name={uploading ? "hourglass-outline" : "add"} size={30} color={t.accent} />
            </Pressable>
          )}
        </View>
        {!user.photo || user.needs_photo_consent ? (
          <Card style={{ marginTop: 12 }}>
            <Row icon="camera-outline" title="Загружаю только свои фото" right={<Toggle value={photoConsent} onValueChange={setPhotoConsent} />} />
          </Card>
        ) : null}

        <SectionTitle>Основное</SectionTitle>
        <Field label="Имя" icon="person-outline" value={draft.name} onChangeText={(v) => set("name", v)} maxLength={32} />
        <Field label="Возраст (18+)" icon="calendar-outline" value={draft.age} onChangeText={(v) => set("age", v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={2} />
        <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600", marginBottom: 6 }}>Пол</Text>
        {options(catalog.genders, (id) => draft.gender === id, (id) => set("gender", id))}
        <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600", marginVertical: 6 }}>Кого ищешь</Text>
        {options(catalog.looking_for, (id) => draft.looking_for === id, (id) => set("looking_for", id))}
        <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600", marginVertical: 6 }}>Что ищешь</Text>
        {options(catalog.intents, (id) => draft.intents.includes(id), (id) => set("intents", toggle(draft.intents, id)))}
        <Card style={{ marginTop: 10, marginBottom: 10 }}>
          <Row icon="location-outline" title="Город" subtitle={draft.city || "Выбрать из списка"} onPress={() => setCityOpen(true)} />
        </Card>
        <Field label="Чем занимаешься" icon="briefcase-outline" value={draft.job} onChangeText={(v) => set("job", v)} maxLength={60} />

        <SectionTitle>О себе</SectionTitle>
        <View style={{ backgroundColor: t.card, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, padding: 12 }}>
          <TextInput accessibilityLabel="О себе" value={draft.bio} onChangeText={(v) => set("bio", v)} multiline maxLength={catalog.limits?.bio ?? 1200} placeholder="Пара слов о себе и о том, как тебе комфортно общаться" placeholderTextColor={t.muted} style={{ color: t.text, fontSize: 16, minHeight: 110, textAlignVertical: "top" }} />
          <Text style={{ color: t.muted, fontSize: 12, alignSelf: "flex-end" }}>{draft.bio.length}/{catalog.limits?.bio ?? 1200}</Text>
        </View>

        <SectionTitle>Особенности (минимум одна)</SectionTitle>
        {options(catalog.neuro, (id) => draft.neuro.includes(id), (id) => set("neuro", toggle(draft.neuro, id)))}
        <SectionTitle>Вайб</SectionTitle>
        {options(catalog.vibe, (id) => draft.vibe.includes(id), (id) => set("vibe", toggle(draft.vibe, id)))}

        <SectionTitle>Согласия</SectionTitle>
        <Card>
          <Row icon="medkit-outline" title="Показывать выбранные особенности" subtitle="Это данные о здоровье. Согласие можно отозвать в настройках на сайте." right={<Toggle value={specialConsent} onValueChange={setSpecialConsent} />} />
        </Card>

        <View style={{ height: 16 }} />
        <ErrorText>{error}</ErrorText>
        <Button title="Сохранить" icon="checkmark" onPress={save} busy={saving} disabled={!draft.name.trim() || !draft.age || !draft.gender || !draft.looking_for || !draft.city || !draft.neuro.length || !specialConsent} />
      </ScrollView>
      <CityPicker visible={cityOpen} places={catalog.places || []} onClose={() => setCityOpen(false)} onPick={(c) => { set("city", c); setCityOpen(false); }} />
    </KeyboardAvoidingView>
  );
}

function CityPicker({ visible, places, onClose, onPick }: { visible: boolean; places: { country: string; cities: string[] }[]; onClose: () => void; onPick: (city: string) => void }) {
  const t = useTheme();
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const flat = places.flatMap((p) => p.cities.map((c) => ({ city: c, country: p.country })));
    const needle = q.trim().toLowerCase();
    return (needle ? flat.filter((r) => r.city.toLowerCase().includes(needle) || r.country.toLowerCase().includes(needle)) : flat).slice(0, 80);
  }, [places, q]);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={{ padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>Город</Text>
            <Pressable onPress={onClose} accessibilityLabel="Закрыть"><Ionicons name="close" size={26} color={t.text} /></Pressable>
          </View>
          <Field label="Поиск" icon="search" value={q} onChangeText={setQ} autoFocus />
        </View>
        <FlatList
          data={rows}
          keyExtractor={(r) => `${r.country}-${r.city}`}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable onPress={() => onPick(item.city)} style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.border }}>
              <Text style={{ color: t.text, fontSize: 17, fontWeight: "600" }}>{item.city}</Text>
              <Text style={{ color: t.muted, fontSize: 13 }}>{item.country}</Text>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}
