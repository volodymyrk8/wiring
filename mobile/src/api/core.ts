/**
 * Transport core: bearer auth, single-flight token refresh and the 426 upgrade signal.
 * No React Native imports, so it runs under `node --test` (see tests/core.test.ts).
 */

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

export type TokenStore = {
  get: (key: "access" | "refresh") => string | null;
  set: (key: "access" | "refresh", value: string | null) => Promise<void>;
  clear: () => Promise<void>;
};

export type Hooks = { onSessionLost?: () => void; onUpgradeRequired?: (minVersion: string) => void };

export type CoreOptions = {
  baseUrl: string;
  version: string;
  platform: string;
  fetchFn: typeof fetch;
  tokens: TokenStore;
  hooks: Hooks;
};

export type Api = <T = any>(path: string, init?: RequestInit) => Promise<T>;

async function parse(response: Response) {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    const hint = response.status >= 500 ? "сервер временно недоступен" : "сервер вернул неожиданный ответ";
    throw new ApiError(hint, {}, response.status);
  }
}

export function createApi(opts: CoreOptions): Api {
  const { baseUrl, version, platform, fetchFn, tokens, hooks } = opts;

  async function send(path: string, init: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-App-Version": version,
      "X-App-Platform": platform,
      ...(init.headers as Record<string, string> | undefined),
    };
    const access = tokens.get("access");
    // Auth endpoints take credentials in the body; a stale bearer must not block a refresh.
    if (access && !path.startsWith("/api/auth/")) headers.Authorization = `Bearer ${access}`;
    const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
    if (init.body && !isForm && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    try {
      return await fetchFn(`${baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new ApiError("нет соединения с сервером", {}, 0);
    }
  }

  // One refresh at a time: concurrent 401s share the same rotation.
  let refreshing: Promise<boolean> | null = null;

  async function refreshTokens(): Promise<boolean> {
    refreshing ??= (async () => {
      const refresh = tokens.get("refresh");
      if (!refresh) return false;
      try {
        const response = await send("/api/auth/refresh", { method: "POST", body: JSON.stringify({ refresh_token: refresh }) });
        const data = await parse(response);
        if (!response.ok || !data.access_token) return false;
        await tokens.set("access", data.access_token);
        await tokens.set("refresh", data.refresh_token);
        return true;
      } catch {
        // Offline: keep the tokens so the caller sees the network error instead of being logged out.
        return true;
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function api<T = any>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
    const response = await send(path, init);
    const data = await parse(response);
    if (response.status === 426 && data.upgrade) hooks.onUpgradeRequired?.(String(data.min_version || ""));
    if (response.status === 401 && data.token_expired && !retried && !path.startsWith("/api/auth/")) {
      if (await refreshTokens()) return api<T>(path, init, true);
      await tokens.clear();
      hooks.onSessionLost?.();
    }
    if (!response.ok || data.ok === false) {
      throw new ApiError(String(data.error || `ошибка ${response.status}`), data, response.status);
    }
    return data as T;
  }

  return api;
}
