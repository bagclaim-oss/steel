import type {
  OrchestratorConfig,
  OrchestratorRun,
} from "./orchestrator-types.js";

const BASE = "/api";
const AUTH_STORAGE_KEY = "companion_auth_token";

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function get<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

async function post<T = unknown>(path: string, body?: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

async function put<T = unknown>(path: string, body?: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

async function del<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ─── Orchestrator API ────────────────────────────────────────────────────────

export const orchestratorApi = {
  // Orchestrator definitions
  list: () => get<OrchestratorConfig[]>("/orchestrators"),

  get: (id: string) => get<OrchestratorConfig>(`/orchestrators/${id}`),

  create: (data: Partial<OrchestratorConfig>) =>
    post<OrchestratorConfig>("/orchestrators", data),

  update: (id: string, data: Partial<OrchestratorConfig>) =>
    put<OrchestratorConfig>(`/orchestrators/${id}`, data),

  delete: (id: string) => del(`/orchestrators/${id}`),

  // Runs
  startRun: (orchestratorId: string, input?: string) =>
    post<OrchestratorRun>(`/orchestrators/${orchestratorId}/run`, input ? { input } : {}),

  listRuns: (orchestratorId: string) =>
    get<OrchestratorRun[]>(`/orchestrators/${orchestratorId}/runs`),

  listAllRuns: (status?: string) =>
    get<OrchestratorRun[]>(`/orchestrator-runs${status ? `?status=${status}` : ""}`),

  getRun: (runId: string) =>
    get<OrchestratorRun>(`/orchestrator-runs/${runId}`),

  cancelRun: (runId: string) =>
    post(`/orchestrator-runs/${runId}/cancel`),

  deleteRun: (runId: string) =>
    del(`/orchestrator-runs/${runId}`),
};
