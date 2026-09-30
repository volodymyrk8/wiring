import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { endpoints, mediaUrl } from "../../src/api/client";
import type { Message, Thread } from "../../src/api/types";
import { useTheme } from "../../src/theme";
import { ErrorText, Loading } from "../../src/ui/kit";

const POLL_MS = 8000;

export default function ChatScreen() {
  const t = useTheme();
  const router = useRouter();
  const peerId = Number(useLocalSearchParams<{ id: string }>().id);
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const res = await endpoints.thread(peerId);
      // Ignore a slow response if a newer request already started.
      if (seq === requestSeq.current) {
        setThread(res);
        setError("");
      }
    } catch (e: any) {
      if (seq === requestSeq.current) setError(e.message);
    }
  }, [peerId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      clearInterval(timer);
      requestSeq.current++;
    };
  }, [load]);

  async function send(body: string) {
    const value = body.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await endpoints.send(peerId, value);
      setText("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  if (!thread) return error ? <ErrorText>{error}</ErrorText> : <Loading />;
  const messages = [...thread.messages].reverse();

  const renderItem = ({ item }: { item: Message }) => {
    const mine = item.mine ?? item.from_id !== peerId;
    return (
      <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%", marginVertical: 3, marginHorizontal: 12 }}>
        <View style={{ backgroundColor: mine ? t.accent : t.card, borderRadius: 16, padding: 10, borderWidth: mine ? 0 : 1, borderColor: t.border }}>
          {!!item.photo_url && <Image source={{ uri: mediaUrl(item.photo_url) }} style={{ width: 200, height: 200, borderRadius: 10, marginBottom: item.body ? 6 : 0 }} />}
          {!!item.audio_url && <Text style={{ color: mine ? t.accentText : t.muted }}>Голосовое{item.transcript ? `: ${item.transcript}` : " (прослушать можно на сайте)"}</Text>}
          {!!item.body && <Text style={{ color: mine ? t.accentText : t.text, fontSize: 16 }}>{item.body}</Text>}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen
        options={{
          title: thread.peer.name,
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Профиль и безопасность" onPress={() => router.push(`/person/${peerId}`)}>
              <Text style={{ color: t.accent, fontSize: 16 }}>Профиль</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        inverted
        data={messages}
        keyExtractor={(m) => String(m.id)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingVertical: 8 }}
        ListFooterComponent={
          !messages.length && thread.openers?.length ? (
            <View style={{ padding: 12 }}>
              <Text style={{ color: t.muted, marginBottom: 8 }}>Как начать разговор:</Text>
              {thread.openers.map((o) => (
                <Pressable key={o} onPress={() => setText(o)} style={{ backgroundColor: t.chip, borderRadius: 12, padding: 10, marginBottom: 6 }}>
                  <Text style={{ color: t.text }}>{o}</Text>
                </Pressable>
              ))}
            </View>
          ) : null
        }
      />
      <ErrorText>{error}</ErrorText>
      <View style={{ flexDirection: "row", padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.card }}>
        <TextInput
          accessibilityLabel="Сообщение"
          value={text}
          onChangeText={setText}
          placeholder="Сообщение"
          placeholderTextColor={t.muted}
          maxLength={1000}
          multiline
          style={{ flex: 1, color: t.text, backgroundColor: t.bg, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 120, fontSize: 16 }}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Отправить" disabled={!text.trim() || sending} onPress={() => send(text)} style={{ justifyContent: "center", paddingHorizontal: 14, opacity: text.trim() ? 1 : 0.4 }}>
          <Text style={{ color: t.accent, fontWeight: "700", fontSize: 16 }}>Отправить</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
