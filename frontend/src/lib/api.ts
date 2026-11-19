const BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/$/, "");

export type ApiResult<T = unknown> = { ok: boolean; data?: T; error?: string; offline?: boolean; status?: number };

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

export function getUser(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function setUser(user: Record<string, unknown> | null) {
  if (typeof window === "undefined") return;
  if (user) localStorage.setItem("user", JSON.stringify(user));
  else localStorage.removeItem("user");
}

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const url = `${BASE}${path.startsWith("/") ? path : "/" + path}`;
  const headers: Record<string, string> = { "Accept": "application/json", ...(options.headers as Record<string, string> || {}) };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  try {
    const res = await fetch(url, { ...options, headers });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!res.ok) {
      const d = (data as Record<string, unknown>) || {};
      let msg = String(d.message || d.error || `Request failed (${res.status})`);
      const errors = d.errors as Record<string, string[]> | undefined;
      if (errors && typeof errors === "object") {
        const firstKey = Object.keys(errors)[0];
        if (firstKey && Array.isArray(errors[firstKey]) && errors[firstKey].length) {
          msg = errors[firstKey][0];
        }
      }
      return { ok: false, status: res.status, error: msg, data: data as T };
    }
    return { ok: true, status: res.status, data: data as T };
  } catch (e) {
    return { ok: false, offline: true, error: "API offline or network error" };
  }
}

export const api = {
  get: <T = unknown>(path: string) => request<T>(path, { method: "GET" }),
  post: <T = unknown>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  put: <T = unknown>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  patch: <T = unknown>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }),
};

export default api;