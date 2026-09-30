import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
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
  const [sending, setSending] = useState(false);
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
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      clearInterval(timer);
      seq.current++;
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

  async function send(body: string) {
    const value = body.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await endpoints.send(peerId, value);
      setText("");
      await poll();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  if (!ready || !peer) return error ? <ErrorText>{error}</ErrorText> : <Loading />;
  const data = [...messages].reverse();
  const canSend = !!text.trim() && !sending;

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
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ paddingVertical: 10 }}
        renderItem={({ item }) => {
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
