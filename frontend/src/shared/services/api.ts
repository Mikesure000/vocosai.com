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

  if (res.status === 401 && !path.includes("/auth/refresh") && !_retried) {
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
  health: () => request("/health"),

  // Tasks
  listTasks: () => request("/tasks"),
  createTask: (data: any) => request("/tasks", { method: "POST", body: JSON.stringify(data) }),
  getTask: (id: string) => request(`/tasks/${id}`),
  getTaskStatus: (id: string) => request(`/tasks/${id}/status`),
  startPipeline: (id: string) => request(`/tasks/${id}/start`, { method: "POST" }),
  getCommentSignals: (id: string) => request(`/tasks/${id}/comment-signals`),
  getSignalComments: (id: string, key: string) => request(`/tasks/${id}/comment-signals/${key}/comments`),

  // AI
  listAiRuns: () => request("/ai/runs"),
  listAiSchemas: () => request("/ai/schemas"),
  listModelRoutes: () => request("/model-gateway/routes"),

  // Governance
  getCostSummary: (params?: string) => request(`/governance/cost-summary${params || ""}`),
  getQualitySummary: (params?: string) => request(`/governance/quality-summary${params || ""}`),

  // Schema
  getSchema: () => request("/schema"),
};
