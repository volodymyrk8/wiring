import { useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";
import { API_URL } from "../../src/api/config";
import { endpoints } from "../../src/api/client";
import { useAuth } from "../../src/auth";
import { useTheme } from "../../src/theme";
import { Button, ErrorText, Field } from "../../src/ui/kit";
import { PersonCard } from "../../src/ui/PersonCard";

export default function Profile() {
  const t = useTheme();
  const { user, logout } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (!user) return null;

  async function deleteAccount() {
    setError("");
    try {
      await endpoints.deleteAccount(password);
      await logout();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      <PersonCard person={user} compact />
      {user.needs_profile && (
        <Text style={{ color: t.muted }}>Анкета не заполнена. Пока фото, теги и описание редактируются на сайте {API_URL.replace("https://", "")}; редактор в приложении — в разработке.</Text>
      )}
      <Text style={{ color: t.muted }}>{user.email}{user.plus ? " · WIRING+" : ""}</Text>
      <Button title="Правила" kind="ghost" onPress={() => Linking.openURL(`${API_URL}/rules`)} />
      <Button title="Конфиденциальность" kind="ghost" onPress={() => Linking.openURL(`${API_URL}/privacy`)} />
      <Button title="Выйти" kind="ghost" onPress={() => logout()} />
      {deleting ? (
        <View>
          <Text style={{ color: t.muted, marginBottom: 8 }}>Аккаунт можно восстановить в течение 7 суток. Введи пароль для подтверждения.</Text>
          <Field label="Пароль" value={password} onChangeText={setPassword} secureTextEntry />
          <ErrorText>{error}</ErrorText>
          <Button title="Удалить аккаунт" kind="danger" disabled={!password} onPress={() => Alert.alert("Удалить аккаунт?", "", [{ text: "Отмена", style: "cancel" }, { text: "Удалить", style: "destructive", onPress: deleteAccount }])} />
        </View>
      ) : (
        <Button title="Удалить аккаунт" kind="danger" onPress={() => setDeleting(true)} />
      )}
    </ScrollView>
  );
}
