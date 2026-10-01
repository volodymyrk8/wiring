import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { mediaUrl } from "../api/client";
import type { Person } from "../api/types";
import { useTagLabel } from "../catalog";
import { radius, shadow, useTheme } from "../theme";
import { Glass } from "./glass";
import { useLayout } from "./layout";

export type SwipeDirection = "like" | "pass";
export type SwipeCardHandle = { fling: (dir: SwipeDirection) => void };

export function photosOf(p: Person): string[] {
  return (p.photos?.length ? p.photos : p.photo ? [p.photo] : []).map(mediaUrl).filter(Boolean);
}

type Props = { person: Person; onSwiped: (dir: SwipeDirection) => void; onInfo: () => void };

export const SwipeCard = forwardRef<SwipeCardHandle, Props>(function SwipeCard({ person, onSwiped, onInfo }, ref) {
  const t = useTheme();
  const label = useTagLabel();
  const { width } = useWindowDimensions();
  const { compact } = useLayout();
  const photos = useMemo(() => photosOf(person), [person]);
  const [index, setIndex] = useState(0);
  const pan = useRef(new Animated.ValueXY()).current;
  const done = useRef(false);

  const finish = useCallback(
    (dir: SwipeDirection) => {
      if (done.current) return;
      done.current = true;
      Haptics.impactAsync(dir === "like" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      Animated.timing(pan, { toValue: { x: (dir === "like" ? 1 : -1) * width * 1.3, y: 40 }, duration: 220, useNativeDriver: true }).start(() => onSwiped(dir));
    },
    [pan, width, onSwiped],
  );

  useImperativeHandle(ref, () => ({ fling: finish }), [finish]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          if (g.dx > 110 || g.vx > 0.9) finish("like");
          else if (g.dx < -110 || g.vx < -0.9) finish("pass");
          else Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 6 }).start();
        },
      }),
    [pan, finish],
  );

  const rotate = pan.x.interpolate({ inputRange: [-width, 0, width], outputRange: ["-12deg", "0deg", "12deg"] });
  const likeOpacity = pan.x.interpolate({ inputRange: [20, 120], outputRange: [0, 1], extrapolate: "clamp" });
  const passOpacity = pan.x.interpolate({ inputRange: [-120, -20], outputRange: [1, 0], extrapolate: "clamp" });
  const tags = [...(person.neuro || []), ...(person.vibe || [])].slice(0, compact ? 3 : 4);

  const step = (delta: number) => setIndex((i) => Math.max(0, Math.min(photos.length - 1, i + delta)));

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[s.card, shadow(3), { backgroundColor: t.card, transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]}
    >
      {photos.length ? (
        <Image source={{ uri: photos[index] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityLabel={`Фото: ${person.name}`} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.chip }]} />
      )}
      <View style={s.tapZones}>
        <Pressable style={{ flex: 1 }} onPress={() => step(-1)} accessibilityLabel="Предыдущее фото" />
        <Pressable style={{ flex: 1 }} onPress={() => step(1)} accessibilityLabel="Следующее фото" />
      </View>
      {photos.length > 1 && (
        <View style={s.bars} pointerEvents="none">
          {photos.map((_, i) => (
            <View key={i} style={[s.bar, { backgroundColor: i === index ? "#fff" : "rgba(255,255,255,0.4)" }]} />
          ))}
        </View>
      )}
      <LinearGradient colors={["transparent", "rgba(10,8,30,0.85)"]} style={s.shade} pointerEvents="none" />
      <View style={s.info} pointerEvents="box-none">
        <View style={{ flex: 1 }} pointerEvents="none">
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[s.name, compact && { fontSize: 25 }]} numberOfLines={1}>{person.name}{person.age ? `, ${person.age}` : ""}</Text>
            {person.online && <View style={s.online} />}
          </View>
          {!!(person.city || person.job) && <Text style={s.meta} numberOfLines={1}>{[person.city, person.job].filter(Boolean).join(" · ")}</Text>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
            {tags.map((tag) => (
              <View key={tag} style={s.glassChip}><Text style={s.glassChipText}>{label(tag)}</Text></View>
            ))}
          </View>
        </View>
        <Glass radius={22} interactive strength="clear" style={s.infoBtn}>
          <Pressable accessibilityRole="button" accessibilityLabel="Открыть профиль" onPress={onInfo} hitSlop={10} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="information" size={22} color="#fff" />
          </Pressable>
        </Glass>
      </View>
      <Animated.View style={[s.stamp, s.stampLike, { opacity: likeOpacity }]} pointerEvents="none"><Text style={[s.stampText, { color: "#3ddc97" }]}>НРАВИТСЯ</Text></Animated.View>
      <Animated.View style={[s.stamp, s.stampPass, { opacity: passOpacity }]} pointerEvents="none"><Text style={[s.stampText, { color: "#ff6b70" }]}>ПРОПУСК</Text></Animated.View>
    </Animated.View>
  );
});

const s = StyleSheet.create({
  card: { flex: 1, borderRadius: radius.lg + 6, overflow: "hidden" },
  tapZones: { position: "absolute", top: 0, left: 0, right: 0, bottom: 150, flexDirection: "row" },
  bars: { position: "absolute", top: 10, left: 12, right: 12, flexDirection: "row", gap: 4 },
  bar: { flex: 1, height: 3.5, borderRadius: 2 },
  shade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 260 },
  info: { position: "absolute", left: 18, right: 14, bottom: 18, flexDirection: "row", alignItems: "flex-end" },
  name: { color: "#fff", fontSize: 30, fontWeight: "800", flexShrink: 1 },
  meta: { color: "rgba(255,255,255,0.85)", fontSize: 15, marginTop: 2 },
  online: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#3ddc97", marginLeft: 8 },
  glassChip: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, marginBottom: 6 },
  glassChipText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  infoBtn: { width: 44, height: 44, marginLeft: 8 },
  stamp: { position: "absolute", top: 46, borderWidth: 4, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  stampLike: { left: 22, borderColor: "#3ddc97", transform: [{ rotate: "-14deg" }] },
  stampPass: { right: 22, borderColor: "#ff6b70", transform: [{ rotate: "14deg" }] },
  stampText: { fontSize: 26, fontWeight: "900", letterSpacing: 2 },
});
