import { Image } from "expo-image";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { mediaUrl } from "../api/client";
import type { Person } from "../api/types";
import { useTagLabel } from "../catalog";
import { useTheme } from "../theme";
import { Chip } from "./kit";

export function photoList(p: Person): string[] {
  const list = (p.photos?.length ? p.photos : p.photo ? [p.photo] : []).map(mediaUrl).filter(Boolean);
  return list;
}

export function PersonCard({ person, compact }: { person: Person; compact?: boolean }) {
  const t = useTheme();
  const label = useTagLabel();
  const { width } = useWindowDimensions();
  const size = width - 32;
  const photos = photoList(person);
  const [page, setPage] = useState(0);
  return (
    <View style={[s.card, { backgroundColor: t.card, borderColor: t.border }]}>
      <View>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / size))}
        >
          {photos.length ? (
            photos.map((uri) => (
              <Image key={uri} source={{ uri }} style={{ width: size - 2, height: compact ? size * 0.8 : size * 1.1 }} contentFit="cover" accessibilityLabel={`Фото: ${person.name}`} />
            ))
          ) : (
            <View style={{ width: size - 2, height: size * 0.6, backgroundColor: t.chip }} />
          )}
        </ScrollView>
        {photos.length > 1 && (
          <Text style={s.counter}>{page + 1}/{photos.length}</Text>
        )}
      </View>
      <View style={{ padding: 14 }}>
        <Text style={{ color: t.text, fontSize: 22, fontWeight: "700" }}>
          {person.name}{person.age ? `, ${person.age}` : ""}
        </Text>
        {!!(person.city || person.job) && (
          <Text style={{ color: t.muted, marginTop: 2 }}>{[person.city, person.job].filter(Boolean).join(" · ")}</Text>
        )}
        {!!person.bio && <Text style={{ color: t.text, marginTop: 10, fontSize: 15, lineHeight: 21 }}>{person.bio}</Text>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
          {[...(person.neuro || []), ...(person.vibe || [])].map((tag) => <Chip key={tag} label={label(tag)} />)}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  counter: { position: "absolute", top: 10, right: 10, color: "#fff", backgroundColor: "#0008", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: "hidden", fontSize: 12 },
});
