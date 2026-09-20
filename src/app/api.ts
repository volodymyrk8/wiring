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
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(`${basePath}${path}`, {
      credentials: "same-origin",
      headers,
      ...options,
    });
    const raw = await response.text();
    let data: Record<string, unknown>;
    try {
      data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      const hint =
        response.status === 413
          ? "файл слишком большой — сожми фото"
          : response.status >= 500
            ? "сервер временно недоступен"
            : "сервер вернул неожиданный ответ";
      throw new ApiError(hint, { ok: false, error: hint }, response.status);
    }
    if (!response.ok || data.ok === false) {
      throw new ApiError(String(data.error || `ошибка ${response.status}`), data, response.status);
    }
    return data as T;
  };
}
