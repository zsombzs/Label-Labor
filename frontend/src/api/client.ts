/**
 * Központi API-kliens: Bearer token automatikus csatolása, 401-re központi
 * kijelentkeztetés, típusos válaszok. A token kulcsa a régi frontenddel
 * kompatibilis marad ("llToken"), hogy a két oldal átmenetileg együtt élhessen.
 */

const API_URL: string = import.meta.env.VITE_API_URL ?? "";

export const TOKEN_KEY = "llToken";

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** Nyilvános végpontokhoz (login, total-label-count) nem küldünk tokent. */
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && auth) {
    // Központi kijelentkeztetés - a régi oldalak window.location.replace("/") logikájának párja.
    clearToken();
    window.location.assign("/");
    throw new ApiError(401, "A munkamenet lejárt");
  }

  if (!response.ok) {
    let detail = `Hiba (${response.status})`;
    try {
      const data: unknown = await response.json();
      if (data && typeof data === "object" && "detail" in data && typeof data.detail === "string") {
        detail = data.detail;
      }
    } catch {
      /* nem JSON válasz */
    }
    throw new ApiError(response.status, detail);
  }

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, auth = true) => request<T>(path, { auth }),
  post: <T>(path: string, body: unknown, auth = true) =>
    request<T>(path, { method: "POST", body, auth }),
};
