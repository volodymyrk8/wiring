import { tr, getLanguage } from "@/lib/i18n";
export type ApiOptions = RequestInit & {
  headers?: Record<string, string>;
};

export type ApiClient = <T = any>(path: string, options?: ApiOptions) => Promise<T>;

export class ApiError extends Error {
  payload: any;
  status: number;

  constructor(message: string, payload: any, status: number) {
    super(message);
    this.name = "ApiError";
    this.payload = payload;
    this.status = status;
  }
}

export function createApi(basePath = ""): ApiClient {
  return async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("X-Wiring-Language", getLanguage());
    if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(`${basePath}${path}`, {
      ...options,
      credentials: "same-origin",
      headers,
    });
    const raw = await response.text();
    let data: Record<string, unknown>;
    try {
      data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      const hint =
        response.status === 413
          ? tr("файл слишком большой — сожми фото")
          : response.status >= 500
            ? tr("сервер временно недоступен")
            : tr("сервер вернул неожиданный ответ");
      throw new ApiError(hint, { ok: false, error: hint }, response.status);
    }
    if (!response.ok || data.ok === false) {
      throw new ApiError(String(data.error || tr("ошибка {0}", response.status)), data, response.status);
    }
    return data as T;
  };
}
