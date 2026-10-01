import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";
import { endpoints } from "../../src/api/client";
import { API_URL } from "../../src/api/config";
import { useAuth } from "../../src/auth";
import { disablePush, enablePush } from "../../src/push";
import { useTheme } from "../../src/theme";
import { Avatar, Button, Card, ErrorText, Field, Row, SectionTitle, Toggle } from "../../src/ui/kit";
import { Column, useTabBarInset } from "../../src/ui/layout";
import { ScreenHeader } from "../../src/ui/ScreenHeader";

function completeness(u: NonNullable<ReturnType<typeof useAuth>["user"]>): { pct: number; missing: string[] } {
  const checks: [boolean, string][] = [
    [!!u.photo, "фото"],
    [!!u.bio, "о себе"],
    [!!u.neuro?.length, "особенности"],
    [!!u.city, "город"],
    [!!u.gender && !!u.looking_for, "кого ищешь"],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return { pct: Math.round((done / checks.length) * 100), missing: checks.filter(([ok]) => !ok).map(([, n]) => n) };
}

export default function Profile() {
  const t = useTheme();
  const router = useRouter();
  const { user, logout, refresh, setUser } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pushBusy, setPushBusy] = useState(false);
  const tabInset = useTabBarInset();

  if (!user) return null;
  const { pct, missing } = completeness(user);

  async function togglePush(on: boolean) {
    setPushBusy(true);
    try {
      if (on) {
        const res = await enablePush();
        if (!res.ok) Alert.alert("Push не включён", res.reason);
      } else {
        await disablePush();
      }
      await refresh();
    } catch (e: any) {
      Alert.alert("Ошибка", e.message);
    } finally {
      setPushBusy(false);
    }
  }

  async function toggleNotices(on: boolean) {
    try {
      const res = await endpoints.setNotifications({ enabled: on });
      setUser(res.user);
    } catch (e: any) {
      Alert.alert("Ошибка", e.message);
    }
  }

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
    <View style={{ flex: 1, backgroundColor: t.bg }}>
    <ScreenHeader title="Профиль" />
    <Column>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 + tabInset }}>
      <LinearGradient colors={[t.accent, t.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 28, padding: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Avatar uri={user.photo} name={user.name} size={72} />
          <View style={{ marginLeft: 16, flex: 1 }}>
            <Text style={{ color: "#fff", fontSize: 24, fontWeight: "800" }}>{user.name}{user.age ? `, ${user.age}` : ""}</Text>
            <Text style={{ color: "rgba(255,255,255,0.85)", marginTop: 2 }}>{user.city || "Город не указан"}{user.plus ? " · WIRING+" : ""}</Text>
          </View>
        </View>
        <View style={{ marginTop: 18 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>Анкета заполнена на {pct}%</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.3)" }}>
            <View style={{ height: 8, borderRadius: 4, width: `${pct}%`, backgroundColor: "#fff" }} />
          </View>
          {!!missing.length && <Text style={{ color: "rgba(255,255,255,0.85)", marginTop: 8, fontSize: 13 }}>Добавь: {missing.join(", ")}</Text>}
        </View>
      </LinearGradient>
      <View style={{ height: 14 }} />
      <Button title="Редактировать анкету" icon="create-outline" onPress={() => router.push("/edit-profile")} />

      <SectionTitle>Уведомления</SectionTitle>
      <Card>
        <Row icon="notifications-outline" title="Уведомления" subtitle="Лайки, мэтчи и сообщения" right={<Toggle value={!!user.notify_enabled} onValueChange={toggleNotices} />} />
        <Row icon="phone-portrait-outline" title="Push на телефон" subtitle={pushBusy ? "Подключаем…" : "Когда приложение закрыто"} right={<Toggle value={!!user.notify_push && !!user.notify_enabled} onValueChange={togglePush} />} />
      </Card>

      <SectionTitle>О сервисе</SectionTitle>
      <Card>
        <Row icon="shield-checkmark-outline" title="Правила" onPress={() => Linking.openURL(`${API_URL}/rules`)} />
        <Row icon="lock-closed-outline" title="Конфиденциальность" onPress={() => Linking.openURL(`${API_URL}/privacy`)} />
        <Row icon="help-buoy-outline" title="Поддержка" onPress={() => Linking.openURL(`${API_URL}/support`)} />
      </Card>

      <SectionTitle>Аккаунт</SectionTitle>
      <Card>
        <Row icon="log-out-outline" title="Выйти" onPress={() => logout()} />
        <Row icon="trash-outline" title="Удалить аккаунт" danger onPress={() => setDeleting(true)} />
      </Card>
      {deleting && (
        <Card style={{ marginTop: 12 }}>
          <Text style={{ color: t.muted, marginBottom: 10 }}>Аккаунт можно восстановить в течение 7 суток. Введи пароль для подтверждения.</Text>
          <Field label="Пароль" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry />
          <ErrorText>{error}</ErrorText>
          <Button title="Удалить аккаунт" kind="danger" disabled={!password} onPress={() => Alert.alert("Удалить аккаунт?", "", [{ text: "Отмена", style: "cancel" }, { text: "Удалить", style: "destructive", onPress: deleteAccount }])} />
          <View style={{ height: 8 }} />
          <Button title="Отмена" kind="ghost" onPress={() => { setDeleting(false); setPassword(""); setError(""); }} />
        </Card>
      )}
      <Text style={{ color: t.muted, textAlign: "center", marginTop: 20, fontSize: 12 }}>{user.email}</Text>
    </ScrollView>
    </Column>
    </View>
  );
}
