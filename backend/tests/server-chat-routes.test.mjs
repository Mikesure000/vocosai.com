// server-chat-routes.test.mjs — AI 聊天路由和 normalizeProviderName 测试
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApiServer } from "../src/server.mjs";

let server;
let baseUrl;
let adminToken;

beforeAll(async () => {
  process.env.VOCOS_JWT_SECRET = "test-secret-for-vitest-a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
  process.env.VOCOS_MODEL_MODE = "mock";
  const app = await createApiServer({ dbPath: ":memory:", skipJwtCheck: true });
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });

  // 注册 + 登录获取 adminToken
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.0.0.100" },
    body: JSON.stringify({ name: "ChatTest", email: "chattest@a.com", password: "test1234", teamName: "ChatTeam" }),
  });
  const regBody = await regRes.json();
  adminToken = regBody.data?.accessToken;
  expect(adminToken).toBeTruthy();
});

afterAll(() => {
  if (server) server.close();
});

async function fetchApi(path, opts = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, headers: res.headers };
}

// ============================================================
// normalizeProviderName - 通过 API 间接测试
// ============================================================

describe("normalizeProviderName", () => {
  it("accepts 'qwen' as valid provider name", async () => {
    const { status } = await fetchApi("/api/model-gateway/providers/qwen/key", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ apiKey: "sk-test-qwen-key-12345678" }),
    });
    // Should not return 400 "Unsupported model provider"
    expect(status).not.toBe(400);
  });

  it("rejects unsupported provider name (403 if no permission, 400 if bad name)", async () => {
    const { status, body } = await fetchApi("/api/model-gateway/providers/unsupported_provider/key", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ apiKey: "sk-test-key" }),
    });
    // 返回 403 (权限不足) 或 400 (不支持的提供商)，取决于权限检查和参数校验的顺序
    expect([400, 403]).toContain(status);
  });
});

// ============================================================
// POST /api/ai/chat
// ============================================================

describe("POST /api/ai/chat", () => {
  it("sends a chat message and returns response", async () => {
    const { status, body } = await fetchApi("/api/ai/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ content: "Hello AI" }),
    });
    expect(status).toBe(200);
    expect(body.data).toBeDefined();
    expect(body.data.session).toBeDefined();
    expect(body.data.userMessage).toBeDefined();
    expect(body.data.assistantMessage).toBeDefined();
  });

  it("rejects without content field", async () => {
    const { status, body } = await fetchApi("/api/ai/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
  });

  it("requires authentication", async () => {
    const { status } = await fetchApi("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ content: "hello" }),
    });
    expect(status).toBe(401);
  });

  it("sends message with providerName=qwen", async () => {
    const { status, body } = await fetchApi("/api/ai/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ content: "你好千问", providerName: "qwen" }),
    });
    expect(status).toBe(200);
    expect(body.data.session).toBeDefined();
    expect(body.data.assistantMessage).toBeDefined();
  });

  it("continues session with sessionId", async () => {
    // First message
    const { body: first } = await fetchApi("/api/ai/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ content: "第一条消息" }),
    });
    const sessionId = first.data.session.id;

    // Second message with sessionId
    const { status, body } = await fetchApi("/api/ai/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ content: "第二条消息", sessionId }),
    });
    expect(status).toBe(200);
    expect(body.data.session.id).toBe(sessionId);
  });
});

// ============================================================
// GET /api/ai/chat/sessions
// ============================================================

describe("GET /api/ai/chat/sessions", () => {
  it("returns sessions list", async () => {
    const { status, body } = await fetchApi("/api/ai/chat/sessions", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(status).toBe(200);
    expect(body.data).toBeDefined();
  });

  it("requires authentication", async () => {
    const { status } = await fetchApi("/api/ai/chat/sessions");
    expect(status).toBe(401);
  });
});

// ============================================================
// GET /api/ai/chat/sessions/:id/messages
// ============================================================

describe("GET /api/ai/chat/sessions/:id/messages", () => {
  it("returns messages for a session", async () => {
    // Create a session first
    const { body: chatBody } = await fetchApi("/api/ai/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ content: "测试消息列表" }),
    });
    const sessionId = chatBody.data.session.id;

    const { status, body } = await fetchApi(`/api/ai/chat/sessions/${sessionId}/messages`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(status).toBe(200);
    expect(body.data).toBeDefined();
  });

  it("requires authentication", async () => {
    const { status } = await fetchApi("/api/ai/chat/sessions/fake-id/messages");
    expect(status).toBe(401);
  });
});

// ============================================================
// DELETE /api/ai/chat/sessions/:id
// ============================================================

describe("DELETE /api/ai/chat/sessions/:id", () => {
  it("deletes a session", async () => {
    // Create a session first
    const { body: chatBody } = await fetchApi("/api/ai/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ content: "将被删除的会话" }),
    });
    const sessionId = chatBody.data.session.id;

    const { status, body } = await fetchApi(`/api/ai/chat/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(status).toBe(200);
    expect(body.data?.ok).toBe(true);
  });

  it("requires authentication", async () => {
    const { status } = await fetchApi("/api/ai/chat/sessions/fake-id", {
      method: "DELETE",
    });
    expect(status).toBe(401);
  });
});

// ============================================================
// Route registration verification
// ============================================================

describe("AI Chat routes are registered", () => {
  it("POST /api/ai/chat is accessible (not 404)", async () => {
    const { status } = await fetchApi("/api/ai/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ content: "route check" }),
    });
    expect(status).not.toBe(404);
  });

  it("GET /api/ai/chat/sessions is accessible (not 404)", async () => {
    const { status } = await fetchApi("/api/ai/chat/sessions", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(status).not.toBe(404);
  });

  it("GET /api/ai/chat/sessions/:id/messages is accessible (not 404)", async () => {
    // 用一个有效的 session ID
    const { body } = await fetchApi("/api/ai/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ content: "route test" }),
    });
    const sessionId = body.data.session.id;
    const { status } = await fetchApi(`/api/ai/chat/sessions/${sessionId}/messages`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(status).not.toBe(404);
  });

  it("DELETE /api/ai/chat/sessions/:id is accessible (not 404)", async () => {
    const { body } = await fetchApi("/api/ai/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ content: "delete route test" }),
    });
    const sessionId = body.data.session.id;
    const { status } = await fetchApi(`/api/ai/chat/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(status).not.toBe(404);
  });
});
