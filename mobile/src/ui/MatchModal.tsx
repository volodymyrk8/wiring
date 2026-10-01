import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { mediaUrl } from "../api/client";
import type { Person } from "../api/types";
import { useTheme } from "../theme";
import { Glass } from "./glass";
import { Button } from "./kit";
import { MAX_CONTENT_WIDTH } from "./layout";

/** "It's a match" sheet: glass card over a dimmed backdrop. */
export function MatchModal({ person, onClose, onWrite }: { person: Person | null; onClose: () => void; onWrite: () => void }) {
  const t = useTheme();
  useEffect(() => {
    if (person) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [person]);
  return (
    <Modal visible={!!person} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Закрыть" onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(10,8,30,0.55)", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Pressable onPress={() => undefined} style={{ width: "100%", maxWidth: Math.min(MAX_CONTENT_WIDTH, 380) }}>
          <Glass radius={32} strength="regular" style={{ padding: 24, alignItems: "center" }}>
            <Image source={{ uri: mediaUrl(person?.photo) }} style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: t.chip }} contentFit="cover" />
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16 }}>
              <Ionicons name="heart" size={22} color={t.accent} />
              <Text accessibilityRole="header" style={{ color: t.text, fontSize: 26, fontWeight: "800", marginLeft: 8 }}>Взаимный лайк</Text>
            </View>
            <Text style={{ color: t.muted, fontSize: 16, textAlign: "center", marginTop: 6, marginBottom: 20 }}>
              У вас взаимная симпатия с {person?.name}. Можно написать первым.
            </Text>
            <View style={{ alignSelf: "stretch", gap: 8 }}>
              <Button title="Написать" icon="chatbubble-ellipses" onPress={onWrite} />
              <Button title="Продолжить ленту" kind="soft" onPress={onClose} />
            </View>
          </Glass>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
