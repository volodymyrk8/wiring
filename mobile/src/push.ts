import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { endpoints } from "./api/client";
import { getToken, setToken } from "./api/tokens";
import type { Me } from "./api/types";

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

const projectId = (): string | undefined => Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

/** Why push cannot work in this build/device, or null when it can. Shown instead of an error. */
export function pushUnavailableReason(): string | null {
  if (!Device.isDevice) return "Работает только на настоящем телефоне";
  if (!projectId()) return "Появится в одной из следующих сборок";
  return null;
}

/** This device has a push token registered on the server. */
export const pushRegisteredHere = (): boolean => !!getToken("push");

/** What the two switches show. Push is on only when notifications are on and this device is registered. */
export function notificationSwitches(user: Pick<Me, "notify_enabled" | "notify_push"> | null) {
  const enabled = !!user?.notify_enabled;
  return { enabled, push: enabled && !!user?.notify_push && pushRegisteredHere() };
}

/**
 * Turn push on for this device: permission → Expo token → server. Call from the switch only.
 * Both flags are always sent explicitly so one switch can never flip the other.
 */
export async function enablePush(): Promise<Me> {
  const reason = pushUnavailableReason();
  if (reason) throw new Error(reason);
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "WIRING", importance: Notifications.AndroidImportance.DEFAULT });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") throw new Error("Уведомления запрещены в настройках телефона");
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
  const res = await endpoints.setNotifications({ enabled: true, push: true });
  await endpoints.registerDevice(token, Platform.OS);
  await setToken("push", token);
  return res.user;
}

/** Remove this device from push and keep the notifications switch as it is. */
export async function disablePush(keepNotifications: boolean): Promise<Me> {
  const token = getToken("push");
  if (token) {
    await endpoints.unregisterDevice(token).catch(() => undefined);
    await setToken("push", null);
  }
  return (await endpoints.setNotifications({ enabled: keepNotifications, push: false })).user;
}

/** Master switch. Turning it off also turns push off; turning it on restores push only if this device is registered. */
export async function setNotificationsEnabled(on: boolean): Promise<Me> {
  if (!on) return disablePush(false);
  return (await endpoints.setNotifications({ enabled: true, push: pushRegisteredHere() })).user;
}

/** Called on logout: forget the device token locally; the server drops it with the session. */
export async function unregisterPush(): Promise<string | null> {
  const token = getToken("push");
  if (token) await setToken("push", null);
  return token;
}
