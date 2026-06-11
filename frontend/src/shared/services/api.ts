const BASE = import.meta.env.VITE_API_BASE || "/api";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        setAccessToken(null);
        return null;
      }
      const json = await res.json();
      const token = json.data?.accessToken;
      setAccessToken(token ?? null);
      return token ?? null;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T = any>(path: string, opts?: RequestInit, _retried = false): Promise<T> {
  const url = `${BASE}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts?.headers as Record<string, string> | undefined),
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(url, {
    ...opts,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && !path.includes("/auth/refresh") && !path.includes("/auth/login") && !path.includes("/auth/register") && !_retried) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request<T>(path, opts, true);
    }
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Health endpoint is at /health (not under /api), needs separate fetch
  health: () => fetch("/health").then(r => r.json()),

  // Tasks
  listTasks: () => request("/tasks"),
  createTask: (data: any) => request("/tasks", { method: "POST", body: JSON.stringify(data) }),
  getTask: (id: string) => request(`/tasks/${id}`),
  getTaskStatus: (id: string) => request(`/tasks/${id}/status`),
  startPipeline: (id: string) => request(`/tasks/${id}/start`, { method: "POST" }),
  getCommentSignals: (id: string) => request(`/tasks/${id}/comment-signals`),
  getSignalComments: (id: string, key: string) => request(`/tasks/${id}/comment-signals/${key}/comments`),
  parseComments: (id: string, data: any) => request(`/tasks/${id}/parse-comments`, { method: "POST", body: JSON.stringify(data) }),
  confirmMapping: (id: string, data: any) => request(`/tasks/${id}/confirm-mapping`, { method: "POST", body: JSON.stringify(data) }),

  // AI
  listAiRuns: () => request("/ai/runs"),
  listAiSchemas: () => request("/ai/schemas"),
  listModelRoutes: () => request("/model-gateway/routes"),

  // Governance
  getCostSummary: (params?: string) => request(`/governance/cost-summary${params || ""}`),
  getQualitySummary: (params?: string) => request(`/governance/quality-summary${params || ""}`),

  // Schema
  getSchema: () => request("/schema"),

  // Categories (BL-001)
  listCategories: () => request("/categories"),

  // Attribution (BL-003/004)
  runAttribution: (id: string) => request(`/tasks/${id}/attribution/run`, { method: "POST" }),
  getAttribution: (id: string) => request(`/tasks/${id}/attribution`),

  // Production Cards (BL-008)
  generateProductionCard: (id: string, platform: string) => request(`/tasks/${id}/production-cards/generate`, { method: "POST", body: JSON.stringify({ platform }) }),
  listProductionCards: (id: string) => request(`/tasks/${id}/production-cards`),
  getProductionCard: (id: string) => request(`/production-cards/${id}`),

  // Brands
  listBrands: () => request("/brands"),
  getBrand: (id: string) => request(`/brands/${id}`),

  // Platform Methodologies
  listPlatformMethods: () => request("/platforms/methodologies"),

  // Admin
  listAdminUsers: () => request("/admin/users"),
  createAdminUser: (data: any) => request("/admin/users", { method: "POST", body: JSON.stringify(data) }),
  updateAdminUser: (id: string, data: any) => request(`/admin/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  // Audit Logs
  listAuditLogs: (params?: string) => request(`/audit-logs${params || ""}`),

  // Model Gateway
  listModelProviders: () => request("/model-gateway/providers"),
  upsertProviderKey: (provider: string, apiKey: string) => request(`/model-gateway/providers/${provider}/key`, { method: "POST", body: JSON.stringify({ apiKey }) }),

  // AI Runs
  getAiRun: (id: string) => request(`/ai/runs/${id}`),
  retryAiRun: (id: string) => request(`/ai/runs/${id}/retry`, { method: "POST" }),

  // Reports
  listTaskReports: (taskId: string) => request(`/tasks/${taskId}/reports`),
  createTaskReport: (taskId: string) => request(`/tasks/${taskId}/reports`, { method: "POST" }),
  getReport: (id: string) => request(`/reports/${id}`),
  downloadReport: (id: string, format?: string) => request(`/reports/${id}/download${format ? `?format=${format}` : ""}`),

  // Team
  getTeamStats: () => request("/team/stats"),
  listMyTasks: () => request("/team/my-tasks"),
  assignTask: (taskId: string, assigneeId: string) => request(`/tasks/${taskId}/assign`, { method: "POST", body: JSON.stringify({ assigneeId }) }),

  // Storage
  getStorageDiagnostics: () => request("/admin/storage/diagnostics"),
};
