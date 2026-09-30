import { Image } from "expo-image";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { Person } from "../api/types";
import { useTagLabel } from "../catalog";
import { radius, shadow, useTheme } from "../theme";
import { Card, Chip, SectionTitle } from "./kit";
import { photosOf } from "./SwipeCard";

export function ProfileView({ person }: { person: Person }) {
  const t = useTheme();
  const label = useTagLabel();
  const { width } = useWindowDimensions();
  const size = width - 32;
  const photos = photosOf(person);
  const [page, setPage] = useState(0);
  return (
    <View>
      <View style={[{ borderRadius: radius.lg, overflow: "hidden", backgroundColor: t.chip }, shadow(2)]}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / size))}>
          {photos.length ? (
            photos.map((uri) => <Image key={uri} source={{ uri }} style={{ width: size, height: size * 1.15 }} contentFit="cover" accessibilityLabel={`Фото: ${person.name}`} />)
          ) : (
            <View style={{ width: size, height: size * 0.6 }} />
          )}
        </ScrollView>
        {photos.length > 1 && <Text style={s.counter}>{page + 1}/{photos.length}</Text>}
      </View>
      <View style={{ paddingHorizontal: 4, paddingTop: 16 }}>
        <Text style={{ color: t.text, fontSize: 28, fontWeight: "800" }}>{person.name}{person.age ? `, ${person.age}` : ""}</Text>
        {!!(person.city || person.job) && <Text style={{ color: t.muted, fontSize: 15, marginTop: 2 }}>{[person.city, person.job].filter(Boolean).join(" · ")}</Text>}
      </View>
      {!!person.bio && <Card style={{ marginTop: 14 }}><Text style={{ color: t.text, fontSize: 16, lineHeight: 23 }}>{person.bio}</Text></Card>}
      {!!person.neuro?.length && (
        <View style={{ marginTop: 14 }}>
          <SectionTitle>Особенности</SectionTitle>
          <View style={s.wrap}>{person.neuro.map((id) => <Chip key={id} label={label(id)} />)}</View>
        </View>
      )}
      {!!person.vibe?.length && (
        <View style={{ marginTop: 6 }}>
          <SectionTitle>Вайб</SectionTitle>
          <View style={s.wrap}>{person.vibe.map((id) => <Chip key={id} label={label(id)} />)}</View>
        </View>
      )}
      {!!person.intents?.length && (
        <View style={{ marginTop: 6 }}>
          <SectionTitle>Что ищет</SectionTitle>
          <View style={s.wrap}>{person.intents.map((id) => <Chip key={id} label={label(id)} />)}</View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  counter: { position: "absolute", top: 12, right: 12, color: "#fff", backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: "hidden", fontSize: 12, fontWeight: "700" },
});
