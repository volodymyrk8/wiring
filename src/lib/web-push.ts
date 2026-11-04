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
  await navigator.serviceWorker.register("/sw.js");
  // register() may resolve while the first worker is still installing.
  const registration = await navigator.serviceWorker.ready;
  let existing = await registration.pushManager.getSubscription();
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
  const applicationServerKey = urlBase64ToBytes(key.publicKey);
  const previousKey = existing?.options?.applicationServerKey;
  if (existing && previousKey && !sameKey(new Uint8Array(previousKey), applicationServerKey)) {
    const endpoint = existing.endpoint;
    await existing.unsubscribe();
    await api("/api/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) });
    existing = null;
  }
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
    }));
  await api("/api/push/subscribe", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
  return "ok";
}

export function syncWebPushIfGranted(api: ApiClient, user: { notify_enabled?: boolean; notify_push?: boolean } | null): void {
  if (!user || user.notify_enabled === false || user.notify_push === false) return;
  if (!webPushSupported() || Notification.permission !== "granted") return;
  void syncWebPush(api, true).catch(() => undefined);
}

function sameKey(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/** Polling fallback for browsers without a registered push subscription. */
export async function pingBrowserFallback(text: string): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !text) return;
  if (webPushSupported()) {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      if (await registration?.pushManager.getSubscription()) return;
    } catch { /* Keep the fallback when worker lookup is unavailable. */ }
  }
  try {
    const note = new Notification("WIRING", { body: text, icon: "/public/favicon.svg", tag: text.slice(0, 48), requireInteraction: true });
    note.onclick = () => { window.focus(); note.close(); };
    setTimeout(() => note.close(), 20000);
  } catch { /* Some mobile browsers only support service worker notifications. */ }
}
