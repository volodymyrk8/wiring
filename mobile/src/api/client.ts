import { API_URL } from "./config";
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

/** Absolute URL for a server-relative media path or a photo object. */
export function mediaUrl(value?: Photo | null): string {
  const path = typeof value === "string" ? value : value?.url;
  if (!path) return "";
  return /^https?:\/\//.test(path) ? path : `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

// The Flask session cookie is stored by the native networking stack
// (NSURLSession / OkHttp), so `credentials: "include"` is all we need.
export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...(init.headers as any) };
  if (init.body && !(init.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { credentials: "include", ...init, headers });
  } catch {
    throw new ApiError("нет соединения с сервером", {}, 0);
  }
  const raw = await response.text();
  let data: any = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    const hint = response.status >= 500 ? "сервер временно недоступен" : "сервер вернул неожиданный ответ";
    throw new ApiError(hint, {}, response.status);
  }
  if (!response.ok || data.ok === false) {
    throw new ApiError(String(data.error || `ошибка ${response.status}`), data, response.status);
  }
  return data as T;
}

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const endpoints = {
  me: () => api<{ user: Me | null }>("/api/me"),
  login: (email: string, password: string) => api<{ user: Me }>("/api/login", json({ email, password })),
  register: (b: { name: string; email: string; password: string }) =>
    api<{ user?: Me }>(
      "/api/register",
      json({ ...b, age_confirm: true, privacy_confirm: true }),
    ),
  logout: () => api("/api/logout", { method: "POST" }),
  catalog: () => api<Catalog>("/api/catalog"),
  feed: (skip: number[] = []) =>
    api<FeedPage>(`/api/feed?hide_empty=1${skip.length ? `&skip=${skip.slice(-200).join(",")}` : ""}`),
  swipe: (target_id: number, direction: "like" | "pass") =>
    api<{ matched: boolean; match: Person | null }>("/api/swipe", json({ target_id, direction })),
  likes: () => api<{ likes: Person[]; plus: boolean }>("/api/likes"),
  matches: () => api<{ matches: Match[] }>("/api/matches"),
  person: (id: number) => api<{ person: Person & { matched?: boolean; liked_you?: boolean; you_liked?: boolean } }>(`/api/people/${id}`),
  thread: (id: number) => api<Thread & { ok: boolean }>(`/api/messages/${id}`),
  send: (to_id: number, body: string) => api("/api/messages", json({ to_id, body })),
  block: (user_id: number) => api("/api/block", json({ user_id })),
  report: (user_id: number, reason: string) => api("/api/report", json({ user_id, reason })),
  unmatch: (user_id: number) => api("/api/unmatch", json({ user_id })),
  deleteAccount: (password: string) => api("/api/me/delete", json({ password })),
};
