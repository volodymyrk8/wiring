import Constants from "expo-constants";
import { Platform } from "react-native";
import { API_URL } from "./config";
import { createApi, type Api, type Hooks } from "./core";
import { clearSession, getToken, setToken } from "./tokens";
import type { Catalog, FeedPage, Match, Me, Person, Photo, Thread } from "./types";

export { ApiError } from "./core";

export const APP_VERSION: string = Constants.expoConfig?.version ?? "0.0.0";

const hooks: Hooks = {};
export const setApiHooks = (next: Hooks) => Object.assign(hooks, next);

/** Absolute URL for a server-relative media path or a photo object. */
export function mediaUrl(value?: Photo | null): string {
  const path = typeof value === "string" ? value : value?.url;
  if (!path) return "";
  return /^https?:\/\//.test(path) ? path : `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

export const api: Api = createApi({
  baseUrl: API_URL,
  version: APP_VERSION,
  platform: Platform.OS,
  fetchFn: (input, init) => fetch(input, init),
  tokens: {
    get: (key) => getToken(key),
    set: (key, value) => setToken(key, value),
    clear: clearSession,
  },
  hooks,
});

const json = (body: unknown, method = "POST"): RequestInit => ({ method, body: JSON.stringify(body) });

export const endpoints = {
  me: () => api<{ user: Me | null }>("/api/me"),
  token: (email: string, password: string) =>
    api<{ access_token: string; refresh_token: string; user: Me }>(
      "/api/auth/token",
      json({ email, password, device: `${Platform.OS} ${APP_VERSION}` }),
    ),
  register: (b: { name: string; email: string; password: string }) =>
    api<{ user?: Me }>("/api/register", json({ ...b, age_confirm: true, privacy_confirm: true })),
  logout: (refresh_token: string | null, push_token: string | null) =>
    api("/api/auth/logout", json({ refresh_token, push_token })),
  catalog: () => api<Catalog>("/api/catalog"),
  feed: (skip: number[] = []) =>
    api<FeedPage>(`/api/feed?hide_empty=1${skip.length ? `&skip=${skip.slice(-200).join(",")}` : ""}`),
  swipe: (target_id: number, direction: "like" | "pass") =>
    api<{ matched: boolean; match: Person | null }>("/api/swipe", json({ target_id, direction })),
  likes: () => api<{ likes: Person[]; plus: boolean }>("/api/likes"),
  matches: () => api<{ matches: Match[] }>("/api/matches"),
  person: (id: number) =>
    api<{ person: Person & { matched?: boolean; liked_you?: boolean; you_liked?: boolean } }>(`/api/people/${id}`),
  thread: (id: number, q: { after?: number; before?: number; limit?: number } = {}) => {
    const qs = Object.entries(q).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("&");
    return api<Thread & { ok: boolean; has_more?: boolean }>(`/api/messages/${id}${qs ? `?${qs}` : ""}`);
  },
  send: (to_id: number, body: string, client_id: string) =>
    api<{ id: number; duplicate?: boolean }>("/api/messages", json({ to_id, body, client_id })),
  sendPhoto: (to_id: number, uri: string, mime: string, name: string) => {
    const form = new FormData();
    form.append("to_id", String(to_id));
    form.append("file", { uri, name, type: mime } as any);
    return api("/api/messages/photo", { method: "POST", body: form });
  },
  block: (user_id: number) => api("/api/block", json({ user_id })),
  report: (user_id: number, reason: string) => api("/api/report", json({ user_id, reason })),
  unmatch: (user_id: number) => api("/api/unmatch", json({ user_id })),
  deleteAccount: (password: string) => api("/api/me/delete", json({ password })),
  saveProfile: (body: Record<string, unknown>) => api<{ user: Me }>("/api/me", json(body, "PATCH")),
  setNotifications: (body: { enabled?: boolean; push?: boolean }) =>
    api<{ user: Me }>("/api/notifications", json(body, "PATCH")),
  uploadPhoto: (uri: string, mime: string, name: string) => {
    const form = new FormData();
    form.append("file", { uri, name, type: mime } as any);
    form.append("photo_rights_consent", "1");
    return api<{ photo: { id: number; url: string } }>("/api/photos", { method: "POST", body: form });
  },
  primaryPhoto: (id: number) => api(`/api/photos/${id}`, json({ is_primary: true }, "PATCH")),
  deletePhoto: (id: number) => api(`/api/photos/${id}`, { method: "DELETE" }),
  registerDevice: (token: string, platform: string) => api("/api/push/device", json({ token, platform })),
  unregisterDevice: (token: string) => api("/api/push/device", json({ token }, "DELETE")),
};
