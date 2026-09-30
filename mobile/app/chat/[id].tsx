import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { endpoints, mediaUrl } from "../../src/api/client";
import type { Message, Thread } from "../../src/api/types";
import { radius, useTheme } from "../../src/theme";
import { Avatar, ErrorText, Loading, tap } from "../../src/ui/kit";

const POLL_MS = 8000;
const PAGE = 50;
const FULL_REFRESH_EVERY = 5; // polls; picks up edits and deletions that `after` cannot see

function merge(a: Message[], b: Message[]): Message[] {
  const byId = new Map<number, Message>();
  for (const m of a) byId.set(m.id, m);
  for (const m of b) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => x.id - y.id);
}

type Pending = { cid: string; body: string; failed: boolean };
const newClientId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const clock = (ts: number) => new Date(ts * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

export default function ChatScreen() {
  const t = useTheme();
  const router = useRouter();
  const peerId = Number(useLocalSearchParams<{ id: string }>().id);
  const [peer, setPeer] = useState<Thread["peer"] | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [openers, setOpeners] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [ready, setReady] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [uploading, setUploading] = useState(false);
  const seq = useRef(0);
  const lastId = useRef(0);
  const ticks = useRef(0);
  const firstLoad = useRef(true);

  const poll = useCallback(async () => {
    const mine = ++seq.current;
    const full = !lastId.current || ++ticks.current % FULL_REFRESH_EVERY === 0;
    try {
      const res = await endpoints.thread(peerId, full ? { limit: PAGE } : { after: lastId.current });
      if (mine !== seq.current) return; // a newer request started, or we left the screen
      setPeer(res.peer);
      setOpeners(res.openers || []);
      setMessages((prev) => merge(prev, res.messages));
      if (res.messages.length) lastId.current = Math.max(lastId.current, ...res.messages.map((m) => m.id));
      if (full && firstLoad.current) {
        firstLoad.current = false;
        setHasMore(!!res.has_more);
      }
      setError("");
      setReady(true);
    } catch (e: any) {
      if (mine === seq.current) setError(e.message);
    }
  }, [peerId]);

  useEffect(() => {
    const counter = seq;
    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      clearInterval(timer);
      counter.current++; // invalidate any in-flight response
    };
  }, [poll]);

  async function loadEarlier() {
    const oldest = messages[0]?.id;
    if (!oldest) return;
    try {
      const res = await endpoints.thread(peerId, { before: oldest, limit: PAGE });
      setMessages((prev) => merge(res.messages, prev));
      setHasMore(!!res.has_more);
    } catch (e: any) {
      setError(e.message);
    }
  }

  // Sends are optimistic. Each keeps its client id, so retrying after a lost response
  // can never create a duplicate on the server.
  async function deliver(item: Pending) {
    setPending((p) => p.map((x) => (x.cid === item.cid ? { ...x, failed: false } : x)));
    try {
      await endpoints.send(peerId, item.body, item.cid);
      setPending((p) => p.filter((x) => x.cid !== item.cid));
      await poll();
    } catch (e: any) {
      setPending((p) => p.map((x) => (x.cid === item.cid ? { ...x, failed: true } : x)));
      setError(e.message);
    }
  }

  function send(body: string) {
    const value = body.trim();
    if (!value) return;
    const item: Pending = { cid: newClientId(), body: value, failed: false };
    setText("");
    setError("");
    setPending((p) => [...p, item]);
    deliver(item);
  }

  async function sendPhoto() {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setUploading(true);
    try {
      await endpoints.sendPhoto(peerId, asset.uri, asset.mimeType || "image/jpeg", asset.fileName || "photo.jpg");
      await poll();
    } catch (e: any) {
      Alert.alert("Фото не отправлено", e.message);
    } finally {
      setUploading(false);
    }
  }

  if (!ready || !peer) return error ? <ErrorText>{error}</ErrorText> : <Loading />;
  const data: (Message | (Pending & { pending: true }))[] = [
    ...pending.map((p) => ({ ...p, pending: true as const })).reverse(),
    ...[...messages].reverse(),
  ];
  const canSend = !!text.trim();

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable onPress={() => router.push(`/person/${peerId}`)} style={{ flexDirection: "row", alignItems: "center" }} accessibilityLabel="Профиль и безопасность">
              <Avatar uri={peer.photo} name={peer.name} size={32} online={peer.online} />
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 17, marginLeft: 10 }}>{peer.name}</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        inverted
        data={data}
        keyExtractor={(m) => ("pending" in m ? m.cid : String(m.id))}
        contentContainerStyle={{ paddingVertical: 10 }}
        renderItem={({ item }) => {
          if ("pending" in item) {
            return (
              <View style={{ alignSelf: "flex-end", maxWidth: "80%", marginVertical: 3, marginHorizontal: 12 }}>
                <Pressable disabled={!item.failed} onPress={() => deliver(item)} style={{ backgroundColor: item.failed ? t.danger + "22" : t.accent + "99", borderRadius: radius.md, borderBottomRightRadius: 5, paddingHorizontal: 13, paddingVertical: 9, borderWidth: item.failed ? 1 : 0, borderColor: t.danger }}>
                  <Text style={{ color: item.failed ? t.text : "#fff", fontSize: 16, lineHeight: 22 }}>{item.body}</Text>
                  <Text style={{ color: item.failed ? t.danger : "rgba(255,255,255,0.8)", fontSize: 11, alignSelf: "flex-end", marginTop: 3 }}>
                    {item.failed ? "Не отправлено · нажми, чтобы повторить" : "Отправляется…"}
                  </Text>
                </Pressable>
              </View>
            );
          }
          const mine = item.mine ?? item.from_id !== peerId;
          const inner = (
            <>
              {!!item.photo_url && <Image source={{ uri: mediaUrl(item.photo_url) }} style={{ width: 220, height: 220, borderRadius: 14, marginBottom: item.body ? 6 : 0 }} />}
              {!!item.audio_url && (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="mic" size={16} color={mine ? "#fff" : t.accent} />
                  <Text style={{ color: mine ? "#fff" : t.muted, marginLeft: 6 }}>{item.transcript || "Голосовое (прослушать можно на сайте)"}</Text>
                </View>
              )}
              {!!item.body && <Text style={{ color: mine ? "#fff" : t.text, fontSize: 16, lineHeight: 22 }}>{item.body}</Text>}
              <Text style={{ color: mine ? "rgba(255,255,255,0.7)" : t.muted, fontSize: 11, alignSelf: "flex-end", marginTop: 3 }}>{clock(item.created_at)}</Text>
            </>
          );
          return (
            <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%", marginVertical: 3, marginHorizontal: 12 }}>
              {mine ? (
                <LinearGradient colors={[t.accent, t.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.md, borderBottomRightRadius: 5, paddingHorizontal: 13, paddingVertical: 9 }}>{inner}</LinearGradient>
              ) : (
                <View style={{ backgroundColor: t.card, borderRadius: radius.md, borderBottomLeftRadius: 5, paddingHorizontal: 13, paddingVertical: 9 }}>{inner}</View>
              )}
            </View>
          );
        }}
        ListFooterComponent={
          <View>
            {hasMore && (
              <Pressable onPress={loadEarlier} style={{ alignSelf: "center", padding: 10 }}>
                <Text style={{ color: t.accent, fontWeight: "700" }}>Загрузить ранее</Text>
              </Pressable>
            )}
            {!messages.length && !!openers.length && (
              <View style={{ padding: 14 }}>
                <Text style={{ color: t.muted, marginBottom: 8 }}>Как начать разговор:</Text>
                {openers.map((o) => (
                  <Pressable key={o} onPress={() => { tap(); setText(o); }} style={{ backgroundColor: t.chip, borderRadius: radius.md, padding: 12, marginBottom: 8 }}>
                    <Text style={{ color: t.text }}>{o}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        }
      />
      <ErrorText>{error}</ErrorText>
      <View style={{ flexDirection: "row", alignItems: "flex-end", padding: 10, gap: 8, backgroundColor: t.bg }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Отправить фото" disabled={uploading} onPress={() => { tap(); sendPhoto(); }} style={{ height: 44, width: 40, alignItems: "center", justifyContent: "center", opacity: uploading ? 0.4 : 1 }}>
          <Ionicons name="image-outline" size={26} color={t.accent} />
        </Pressable>
        <TextInput
          accessibilityLabel="Сообщение"
          value={text}
          onChangeText={setText}
          placeholder="Сообщение"
          placeholderTextColor={t.muted}
          maxLength={1000}
          multiline
          style={{ flex: 1, color: t.text, backgroundColor: t.card, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, maxHeight: 120, fontSize: 16 }}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Отправить" disabled={!canSend} onPress={() => { tap(); send(text); }}>
          <LinearGradient colors={[t.accent, t.accent2]} style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", opacity: canSend ? 1 : 0.4 }}>
            <Ionicons name="arrow-up" size={22} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
