export type ApiError = {
  message: string;
  details?: unknown;
};

const API_URL = (import.meta.env.VITE_API_URL ?? "").trim();

export function getApiUrl() {
  return API_URL;
}

export function getToken(): string | null {
  return localStorage.getItem("auth_token") ?? sessionStorage.getItem("auth_token");
}

export function setToken(token: string | null, opts?: { persist?: boolean }) {
  const persist = opts?.persist ?? true;
  localStorage.removeItem("auth_token");
  sessionStorage.removeItem("auth_token");
  if (!token) return;
  if (persist) localStorage.setItem("auth_token", token);
  else sessionStorage.setItem("auth_token", token);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(init?.headers ?? {});
  headers.set("accept", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  const base = API_URL ? API_URL : "";
  const timeoutMs = 30000;
  const hasExternalSignal = Boolean(init?.signal);
  const controller = hasExternalSignal ? null : new AbortController();
  const timer = hasExternalSignal
    ? null
    : window.setTimeout(() => {
        try {
          controller?.abort();
        } catch {
          return;
        }
      }, timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, headers, signal: init?.signal ?? controller?.signal });
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Tempo esgotado ao conectar no servidor" : "Falha ao conectar no servidor";
    throw { message: msg, details: null } satisfies ApiError;
  } finally {
    if (timer != null) window.clearTimeout(timer);
  }
  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message = (data && typeof data.message === "string" && data.message) || `Erro HTTP ${res.status}`;
    throw { message, details: data?.details ?? data?.issues ?? null } satisfies ApiError;
  }

  return data as T;
}
