export type ApiOptions = RequestInit & {
  headers?: Record<string, string>;
};

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

export function createApi(basePath = "") {
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
    const data = await response.json().catch(() => ({ ok: false, error: "битый ответ" }));
    if (!response.ok || data.ok === false) {
      throw new ApiError(data.error || `ошибка ${response.status}`, data, response.status);
    }
    return data as T;
  };
}
