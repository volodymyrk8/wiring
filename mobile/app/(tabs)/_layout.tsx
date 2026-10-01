import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useEffect } from "react";
import { useAuth } from "../../src/auth";
import { useTheme } from "../../src/theme";

const BADGE_REFRESH_MS = 30000;

/**
 * Native tab bar: UITabBar on iOS (Liquid Glass on iOS 26+, collapses while scrolling),
 * Material bottom navigation on Android. Badges come from /api/me.
 */
export default function TabsLayout() {
  const t = useTheme();
  const { user, refresh } = useAuth();

  useEffect(() => {
    const timer = setInterval(() => void refresh(), BADGE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const unread = user?.unread ?? 0;
  const likes = user?.likes_in ?? 0;
  const badge = (n: number) => (n > 0 ? String(n > 99 ? "99+" : n) : undefined);

  return (
    <NativeTabs tintColor={t.accent} minimizeBehavior="onScrollDown" badgeBackgroundColor={t.accent}>
      <NativeTabs.Trigger name="feed">
        <NativeTabs.Trigger.Label>Лента</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "flame", selected: "flame.fill" }} md="local_fire_department" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="likes">
        <NativeTabs.Trigger.Label>Лайки</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "heart", selected: "heart.fill" }} md="favorite" />
        <NativeTabs.Trigger.Badge hidden={!likes}>{badge(likes)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chats">
        <NativeTabs.Trigger.Label>Чаты</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "bubble.left.and.bubble.right", selected: "bubble.left.and.bubble.right.fill" }} md="chat" />
        <NativeTabs.Trigger.Badge hidden={!unread}>{badge(unread)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Профиль</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
