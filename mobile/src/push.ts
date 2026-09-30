import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { endpoints } from "./api/client";
import { getToken, setToken } from "./api/tokens";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Server paths from push payloads (/chats/5, /likes) → app routes. */
export function routeForPush(url?: string): string | null {
  if (!url) return null;
  const chat = url.match(/^\/chats\/(\d+)/);
  if (chat) return `/chat/${chat[1]}`;
  if (url.startsWith("/likes")) return "/(tabs)/likes";
  if (url.startsWith("/chats")) return "/(tabs)/chats";
  return null;
}

export type PushResult = { ok: true } | { ok: false; reason: string };

/**
 * Ask for permission, fetch the Expo push token and register it. Call from an explicit user
 * action (the notification toggle), never on launch.
 */
export async function enablePush(): Promise<PushResult> {
  if (!Device.isDevice) return { ok: false, reason: "push работает только на настоящем телефоне" };
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { ok: false, reason: "не настроен EAS projectId (см. mobile/README.md)" };
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "WIRING", importance: Notifications.AndroidImportance.DEFAULT });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return { ok: false, reason: "уведомления запрещены в настройках телефона" };
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await endpoints.setNotifications({ enabled: true, push: true });
  await endpoints.registerDevice(token, Platform.OS);
  await setToken("push", token);
  return { ok: true };
}

/** Remove this device from the server. Returns the removed token for the logout call. */
export async function unregisterPush(): Promise<string | null> {
  const token = getToken("push");
  if (token) await setToken("push", null);
  return token;
}

export async function disablePush(): Promise<void> {
  const token = getToken("push");
  await endpoints.setNotifications({ push: false });
  if (token) {
    await endpoints.unregisterDevice(token).catch(() => undefined);
    await setToken("push", null);
  }
}
