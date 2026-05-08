import { apiFetch } from "./http";
import type {
  Cliente,
  ClienteListItem,
  CotaInput,
  AutomationDashboard,
  AutomationJob,
  DashboardSummary,
  NotificationsResponse,
  User,
  UserListItem
} from "./types";

export async function bootstrap(email: string, password: string, nome?: string) {
  return apiFetch<{ user: User; token: string }>("/api/auth/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, nome })
  });
}

export async function login(email: string, password: string) {
  return apiFetch<{ user: User; token: string }>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

export async function me() {
  return apiFetch<{ user: User }>("/api/auth/me");
}

export async function listClients(params: {
  q?: string;
  contemplado?: "sim" | "nao";
  multiplasCotas?: boolean;
  semFoto?: boolean;
  contempladoSemFoto?: boolean;
  parcelasEmAberto?: boolean;
  take?: number;
  skip?: number;
}) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.contemplado) search.set("contemplado", params.contemplado);
  if (params.multiplasCotas) search.set("multiplasCotas", "1");
  if (params.semFoto) search.set("semFoto", "1");
  if (params.contempladoSemFoto) search.set("contempladoSemFoto", "1");
  if (params.parcelasEmAberto) search.set("parcelasEmAberto", "1");
  if (params.take) search.set("take", String(params.take));
  if (params.skip) search.set("skip", String(params.skip));

  const qs = search.toString();
  return apiFetch<{ items: ClienteListItem[]; total: number }>(`/api/clients${qs ? `?${qs}` : ""}`);
}

export async function getClient(id: string) {
  return apiFetch<{ cliente: Cliente; isVip: boolean }>(`/api/clients/${id}`);
}

export async function createClient(input: {
  nome: string;
  telefone: string | null;
  active: boolean;
  pontuacaoRanking: number;
  categoria: "VIP" | "NORMAL" | "RISCO";
  dataNascimento: string | null;
  tirouFoto: boolean;
  observacoes: string | null;
  cotas: CotaInput[];
}) {
  return apiFetch<{ cliente: Cliente; isVip: boolean }>(`/api/clients`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function updateClient(
  id: string,
  input: {
    nome: string;
    telefone: string | null;
    active: boolean;
    pontuacaoRanking: number;
    categoria: "VIP" | "NORMAL" | "RISCO";
    dataNascimento: string | null;
    tirouFoto: boolean;
    observacoes: string | null;
    cotas: CotaInput[];
  }
) {
  return apiFetch<{ cliente: Cliente; isVip: boolean }>(`/api/clients/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function deleteClient(id: string) {
  return apiFetch<void>(`/api/clients/${id}`, { method: "DELETE" });
}

export async function uploadClientPhoto(id: string, file: File) {
  const form = new FormData();
  form.append("foto", file);
  return apiFetch<{ cliente: { id: string; fotoPath: string | null } }>(`/api/clients/${id}/photo`, {
    method: "POST",
    body: form
  });
}

export async function getDashboardSummary() {
  return apiFetch<DashboardSummary>("/api/dashboard/summary");
}

export async function getNotifications() {
  return apiFetch<NotificationsResponse>("/api/notifications");
}

export async function listUsers() {
  return apiFetch<{ users: UserListItem[] }>("/api/users");
}

export async function createUser(input: {
  email: string;
  password: string;
  nome: string | null;
  role: "ADMIN" | "COMERCIAL" | "LEITURA";
}) {
  return apiFetch<{ user: UserListItem }>("/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function updateUser(
  id: string,
  input: { nome?: string | null; role?: "ADMIN" | "COMERCIAL" | "LEITURA"; active?: boolean }
) {
  return apiFetch<{ user: UserListItem }>(`/api/users/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function resetUserPassword(id: string, password: string) {
  return apiFetch<void>(`/api/users/${id}/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password })
  });
}

export async function resetPassword(email: string, code: string, password: string) {
  return apiFetch<void>("/api/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code, password })
  });
}

export async function getAutomationDashboard() {
  return apiFetch<AutomationDashboard>("/automation-api/dashboard");
}

export async function listAutomationJobs() {
  try {
    const r = await apiFetch<{ items: AutomationJob[] }>("/automation-api/jobs");
    return { items: r.items, total: r.items.length };
  } catch {
    return apiFetch<{ items: AutomationJob[]; total: number }>("/api/boletos-envios?take=200&skip=0");
  }
}

export async function scanBoletos() {
  return apiFetch<{ encontrados: number; enfileirados: number; erros: number }>("/automation-api/scan", { method: "POST" });
}

export async function startAutomation() {
  return apiFetch<{ ok: boolean }>("/automation-api/start", { method: "POST" });
}

export async function stopAutomation() {
  return apiFetch<{ ok: boolean }>("/automation-api/stop", { method: "POST" });
}

export async function retryAutomationJob(id: string) {
  return apiFetch<{ ok: boolean }>(`/automation-api/jobs/${id}/retry`, { method: "POST" });
}
