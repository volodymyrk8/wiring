import type { ApiClient } from "@/app/api";

function urlBase64ToBytes(value: string): Uint8Array {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function webPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function iosNeedsHomeScreen(): boolean {
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return ios && !standalone;
}

/** Subscribe or drop the browser push endpoint. Never requests permission. */
export async function syncWebPush(api: ApiClient, enabled: boolean): Promise<"ok" | "unsupported" | "unavailable"> {
  if (!webPushSupported()) return "unsupported";
  const registration = await navigator.serviceWorker.register("/sw.js");
  const existing = await registration.pushManager.getSubscription();
  if (!enabled) {
    if (existing) {
      await api("/api/push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint: existing.endpoint }),
      }).catch(() => undefined);
      await existing.unsubscribe();
    }
    return "ok";
  }
  if (Notification.permission !== "granted") return "unavailable";
  const key = await api<{ publicKey?: string }>("/api/push/public-key");
  if (!key.publicKey) return "unavailable";
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(key.publicKey) as BufferSource,
    }));
  await api("/api/push/subscribe", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
  return "ok";
}

export function syncWebPushIfGranted(api: ApiClient, user: { notify_enabled?: boolean; notify_push?: boolean } | null): void {
  if (!user || user.notify_enabled === false || user.notify_push === false) return;
  if (!webPushSupported() || Notification.permission !== "granted") return;
  void syncWebPush(api, true).catch(() => undefined);
}
