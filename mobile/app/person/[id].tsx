import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { endpoints } from "../../src/api/client";
import type { Person } from "../../src/api/types";
import { Button, ErrorText, Loading, SectionTitle } from "../../src/ui/kit";
import { ProfileView } from "../../src/ui/ProfileView";

const REASONS: [string, string][] = [
  ["spam", "Спам / реклама"],
  ["fake", "Фейк или чужие фото"],
  ["harassment", "Домогательство / угрозы"],
  ["underage", "Похоже, нет 18"],
  ["other", "Другое"],
];

export default function PersonScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const router = useRouter();
  const [person, setPerson] = useState<(Person & { matched?: boolean }) | null>(null);
  const [error, setError] = useState("");
  const [reasonsOpen, setReasonsOpen] = useState(false);

  useEffect(() => {
    endpoints.person(id).then((r) => setPerson(r.person)).catch((e) => setError(e.message));
  }, [id]);

  function confirmBlock() {
    Alert.alert("Заблокировать?", "Человек исчезнет из ленты и чатов.", [
      { text: "Отмена", style: "cancel" },
      { text: "Заблокировать", style: "destructive", onPress: () => endpoints.block(id).then(() => router.dismissAll()).catch((e) => Alert.alert("Ошибка", e.message)) },
    ]);
  }

  async function report(reason: string) {
    try {
      await endpoints.report(id, reason);
      setReasonsOpen(false);
      Alert.alert("Спасибо", "Жалоба отправлена, мы её рассмотрим.");
    } catch (e: any) {
      Alert.alert("Ошибка", e.message);
    }
  }

  if (!person) return error ? <ErrorText>{error}</ErrorText> : <Loading />;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, width: "100%", maxWidth: 560, alignSelf: "center" }}>
      <ProfileView person={person} />
      <View style={{ height: 18 }} />
      {person.matched && <Button title="Написать" icon="chatbubble-ellipses" onPress={() => router.push(`/chat/${id}`)} />}
      <SectionTitle>Безопасность</SectionTitle>
      {reasonsOpen ? (
        <View style={{ gap: 8 }}>
          {REASONS.map(([rid, label]) => <Button key={rid} title={label} kind="soft" onPress={() => report(rid)} />)}
          <Button title="Отмена" kind="ghost" onPress={() => setReasonsOpen(false)} />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Button title="Пожаловаться" kind="soft" icon="flag-outline" onPress={() => setReasonsOpen(true)} />
          <Button title="Заблокировать" kind="ghost" icon="ban-outline" onPress={confirmBlock} />
        </View>
      )}
    </ScrollView>
  );
}
