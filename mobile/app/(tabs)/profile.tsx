import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Platform, ScrollView, Text, View } from "react-native";
import { endpoints } from "../../src/api/client";
import { API_URL } from "../../src/api/config";
import { useAuth } from "../../src/auth";
import { disablePush, enablePush, notificationSwitches, pushUnavailableReason, setNotificationsEnabled } from "../../src/push";
import { useTheme } from "../../src/theme";
import { Avatar, Button, Card, ErrorText, Field, Row, SectionTitle, Toggle } from "../../src/ui/kit";
import { Column, useGutter, useTabBarInset } from "../../src/ui/layout";
import { setPrefs, usePrefs } from "../../src/prefs";
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
  const { user, logout, setUser } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pushBusy, setPushBusy] = useState(false);
  const tabInset = useTabBarInset();
  const gutter = useGutter();
  const prefs = usePrefs();

  if (!user) return null;
  const { pct, missing } = completeness(user);

  const switches = notificationSwitches(user);
  const pushBlocked = pushUnavailableReason();

  async function togglePush(on: boolean) {
    setPushBusy(true);
    try {
      setUser(on ? await enablePush() : await disablePush(true));
    } catch (e: any) {
      Alert.alert("Push не включён", e.message);
    } finally {
      setPushBusy(false);
    }
  }

  async function toggleNotices(on: boolean) {
    setPushBusy(true);
    try {
      setUser(await setNotificationsEnabled(on));
    } catch (e: any) {
      Alert.alert("Ошибка", e.message);
    } finally {
      setPushBusy(false);
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
    <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 40 + tabInset }}>
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

      <SectionTitle>Видимость</SectionTitle>
      <Card>
        <Row icon="eye-outline" title="Кому показывать мою анкету" subtitle="Возраст, откуда, особенности" onPress={() => router.push("/visibility")} />
      </Card>

      {Platform.OS === "android" && (
        <>
          <SectionTitle>Оформление</SectionTitle>
          <Card>
            <Row icon="sparkles-outline" title="Стеклянный стиль" subtitle="Полупрозрачные кнопки и панели (бета)" onPress={() => setPrefs({ androidGlass: !prefs.androidGlass })} right={<Toggle value={prefs.androidGlass} onValueChange={(v) => setPrefs({ androidGlass: v })} />} />
          </Card>
        </>
      )}

      <SectionTitle>Уведомления</SectionTitle>
      <Card>
        <Row icon="notifications-outline" title="Уведомления" subtitle="Лайки, мэтчи и сообщения" onPress={pushBusy ? undefined : () => toggleNotices(!switches.enabled)} right={<Toggle value={switches.enabled} disabled={pushBusy} onValueChange={toggleNotices} />} />
        <Row
          icon="phone-portrait-outline"
          title="Push на телефон"
          subtitle={pushBusy ? "Сохраняем…" : !switches.enabled ? "Сначала включи уведомления" : pushBlocked ?? "Когда приложение закрыто"}
          onPress={pushBusy || !switches.enabled || pushBlocked ? undefined : () => togglePush(!switches.push)}
          right={<Toggle value={switches.push} disabled={pushBusy || !switches.enabled || !!pushBlocked} onValueChange={togglePush} />}
        />
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
