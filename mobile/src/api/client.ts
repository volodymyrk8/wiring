import Constants from "expo-constants";
import { Platform } from "react-native";
import { API_URL } from "./config";
import { clearSession, getToken, setToken } from "./tokens";
import type { Catalog, FeedPage, Match, Me, Person, Photo, Thread } from "./types";

export class ApiError extends Error {
  status: number;
  payload: any;
  constructor(message: string, payload: any, status: number) {
    super(message);
    this.name = "ApiError";
    this.payload = payload;
    this.status = status;
  }
}

export const APP_VERSION: string = Constants.expoConfig?.version ?? "0.0.0";

type Hooks = { onSessionLost?: () => void; onUpgradeRequired?: (minVersion: string) => void };
const hooks: Hooks = {};
export const setApiHooks = (next: Hooks) => Object.assign(hooks, next);

/** Absolute URL for a server-relative media path or a photo object. */
export function mediaUrl(value?: Photo | null): string {
  const path = typeof value === "string" ? value : value?.url;
  if (!path) return "";
  return /^https?:\/\//.test(path) ? path : `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function parse(response: Response) {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    const hint = response.status >= 500 ? "сервер временно недоступен" : "сервер вернул неожиданный ответ";
    throw new ApiError(hint, {}, response.status);
  }
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-App-Version": APP_VERSION,
    "X-App-Platform": Platform.OS,
    ...(init.headers as Record<string, string> | undefined),
  };
  const access = getToken("access");
  // Auth endpoints take credentials in the body; a stale bearer must not block a refresh.
  if (access && !path.startsWith("/api/auth/")) headers.Authorization = `Bearer ${access}`;
  if (init.body && !(init.body instanceof FormData) && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  try {
    return await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("нет соединения с сервером", {}, 0);
  }
}

// One refresh at a time: concurrent 401s share the same rotation.
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  refreshing ??= (async () => {
    const refresh = getToken("refresh");
    if (!refresh) return false;
    try {
      const response = await send("/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refresh }),
      });
      const data = await parse(response);
      if (!response.ok || !data.access_token) return false;
      await setToken("access", data.access_token);
      await setToken("refresh", data.refresh_token);
      return true;
    } catch {
      // Offline: keep the tokens, the caller sees the network error instead of being logged out.
      return true;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api<T = any>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const response = await send(path, init);
  const data = await parse(response);
  if (response.status === 426 && data.upgrade) {
    hooks.onUpgradeRequired?.(String(data.min_version || ""));
  }
  if (response.status === 401 && data.token_expired && !retried && !path.startsWith("/api/auth/")) {
    if (await refreshTokens()) return api<T>(path, init, true);
    await clearSession();
    hooks.onSessionLost?.();
  }
  if (!response.ok || data.ok === false) {
    throw new ApiError(String(data.error || `ошибка ${response.status}`), data, response.status);
  }
  return data as T;
}

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
  send: (to_id: number, body: string) => api("/api/messages", json({ to_id, body })),
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
