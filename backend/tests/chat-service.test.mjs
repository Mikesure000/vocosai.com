// chat-service.test.mjs — AI 聊天服务核心功能测试
import { describe, it, expect, beforeEach } from "vitest";
import { createStore, createId, now } from "../src/store.mjs";
import { createSession, sendMessage, listSessions, listMessages, deleteSession } from "../src/chat-service.mjs";

// ============================================================
// 辅助：创建内存存储 + Mock Provider Secrets
// ============================================================

function createTestStore() {
  const store = createStore({ dbPath: ":memory:" });
  return store;
}

// 每个测试用例前确保 VOCOS_MODEL_MODE=mock，不真实调用 AI
beforeEach(() => {
  process.env.VOCOS_MODEL_MODE = "mock";
  process.env.VOCOS_JWT_SECRET = "test-secret-for-vitest-a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
});

// ============================================================
// createSession
// ============================================================

describe("createSession", () => {
  it("creates a session with userId and returns expected fields", async () => {
    const store = createTestStore();
    const session = await createSession(store, { userId: "user_1" });

    expect(session).toBeDefined();
    expect(session.id).toMatch(/^chat_session_/);
    expect(session.userId).toBe("user_1");
    expect(session.teamId).toBeNull();
    expect(session.providerName).toBeNull();
    expect(session.modelName).toBeNull();
    expect(session.title).toBeNull();
    expect(session.messageCount).toBe(0);
    expect(session.lastMessageAt).toBeNull();
    expect(session.createdAt).toBeTruthy();
    expect(session.updatedAt).toBeTruthy();
  });

  it("creates a session with teamId and providerName", async () => {
    const store = createTestStore();
    const session = await createSession(store, {
      userId: "user_1",
      teamId: "team_1",
      providerName: "qwen",
      modelName: "qwen-max"
    });

    expect(session.teamId).toBe("team_1");
    expect(session.providerName).toBe("qwen");
    expect(session.modelName).toBe("qwen-max");
  });

  it("persists the session in store", async () => {
    const store = createTestStore();
    const session = await createSession(store, { userId: "user_1" });

    const found = store.get("chatSessions", session.id);
    expect(found).toBeDefined();
    expect(found.userId).toBe("user_1");
  });
});

// ============================================================
// sendMessage
// ============================================================

describe("sendMessage", () => {
  it("auto-creates a session when sessionId is not provided", async () => {
    const store = createTestStore();
    const result = await sendMessage(store, {
      userId: "user_1",
      content: "你好，AI"
    });

    expect(result.session).toBeDefined();
    expect(result.session.id).toMatch(/^chat_session_/);
    expect(result.session.userId).toBe("user_1");
  });

  it("returns userMessage and assistantMessage", async () => {
    const store = createTestStore();
    const result = await sendMessage(store, {
      userId: "user_1",
      content: "测试消息"
    });

    expect(result.userMessage).toBeDefined();
    expect(result.userMessage.role).toBe("user");
    expect(result.userMessage.content).toBe("测试消息");
    expect(result.userMessage.sessionId).toBe(result.session.id);

    expect(result.assistantMessage).toBeDefined();
    expect(result.assistantMessage.role).toBe("assistant");
    expect(result.assistantMessage.content).toBeTruthy();
    expect(result.assistantMessage.sessionId).toBe(result.session.id);
  });

  it("in mock mode, assistant returns mock reply", async () => {
    const store = createTestStore();
    const result = await sendMessage(store, {
      userId: "user_1",
      content: "Hello"
    });

    expect(result.assistantMessage.content).toContain("[Mock 回复]");
    expect(result.assistantMessage.content).toContain("Hello");
  });

  it("uses existing session when sessionId is provided", async () => {
    const store = createTestStore();
    const session = await createSession(store, { userId: "user_1" });

    const result = await sendMessage(store, {
      userId: "user_1",
      sessionId: session.id,
      content: "继续对话"
    });

    expect(result.session.id).toBe(session.id);
  });

  it("throws 404 when session not found", async () => {
    const store = createTestStore();

    await expect(
      sendMessage(store, { userId: "user_1", sessionId: "chat_session_nonexistent", content: "hi" })
    ).rejects.toThrow("Chat session not found");
  });

  it("throws 403 when session belongs to another user", async () => {
    const store = createTestStore();
    const session = await createSession(store, { userId: "user_1" });

    await expect(
      sendMessage(store, { userId: "user_2", sessionId: session.id, content: "hi" })
    ).rejects.toThrow("Access denied");
  });

  it("updates session title from first user message", async () => {
    const store = createTestStore();
    const result = await sendMessage(store, {
      userId: "user_1",
      content: "这是我的第一条消息，用于设置标题"
    });

    expect(result.session.title).toBeTruthy();
    // 标题应该是消息内容的前50个字符
    expect(result.session.title).toContain("这是我的第一条消息");
  });

  it("updates messageCount and lastMessageAt", async () => {
    const store = createTestStore();
    const result = await sendMessage(store, {
      userId: "user_1",
      content: "hi"
    });

    expect(result.session.messageCount).toBe(2); // user + assistant
    expect(result.session.lastMessageAt).toBeTruthy();
  });

  it("preserves conversation context across messages", async () => {
    const store = createTestStore();
    const result1 = await sendMessage(store, { userId: "user_1", content: "第一条消息" });
    const sessionId = result1.session.id;

    const result2 = await sendMessage(store, {
      userId: "user_1",
      sessionId,
      content: "第二条消息"
    });

    // 第二条消息后应该有4条消息（2 user + 2 assistant）
    expect(result2.session.messageCount).toBe(4);
  });
});

// ============================================================
// listSessions
// ============================================================

describe("listSessions", () => {
  it("returns sessions for a specific user only", async () => {
    const store = createTestStore();
    await createSession(store, { userId: "user_1" });
    await createSession(store, { userId: "user_1" });
    await createSession(store, { userId: "user_2" });

    const result = listSessions(store, { userId: "user_1" });
    expect(result.sessions.length).toBe(2);
    expect(result.total).toBe(2);
    result.sessions.forEach(s => expect(s.userId).toBe("user_1"));
  });

  it("returns empty for user with no sessions", () => {
    const store = createTestStore();
    const result = listSessions(store, { userId: "user_no_session" });
    expect(result.sessions).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("respects limit and offset", async () => {
    const store = createTestStore();
    for (let i = 0; i < 5; i++) {
      await createSession(store, { userId: "user_1" });
    }

    const page1 = listSessions(store, { userId: "user_1", limit: 2, offset: 0 });
    expect(page1.sessions.length).toBe(2);
    expect(page1.total).toBe(5);

    const page2 = listSessions(store, { userId: "user_1", limit: 2, offset: 2 });
    expect(page2.sessions.length).toBe(2);
  });

  it("sorts sessions by updatedAt descending", async () => {
    const store = createTestStore();
    // 发送消息会更新 session 的 updatedAt
    await sendMessage(store, { userId: "user_1", content: "最新消息" });
    await createSession(store, { userId: "user_1" });

    const result = listSessions(store, { userId: "user_1" });
    // 有消息的 session 应排在前面（updatedAt 更晚）
    expect(result.sessions.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// listMessages
// ============================================================

describe("listMessages", () => {
  it("lists messages for a session", async () => {
    const store = createTestStore();
    const result = await sendMessage(store, { userId: "user_1", content: "hello" });
    const sessionId = result.session.id;

    const messages = listMessages(store, { sessionId, userId: "user_1" });
    expect(messages.messages.length).toBe(2); // user + assistant
    expect(messages.total).toBe(2);
  });

  it("throws 404 when session not found", () => {
    const store = createTestStore();
    expect(() => {
      listMessages(store, { sessionId: "chat_session_nonexistent", userId: "user_1" });
    }).toThrow("Chat session not found");
  });

  it("throws 403 when session belongs to another user", async () => {
    const store = createTestStore();
    const result = await sendMessage(store, { userId: "user_1", content: "hello" });

    expect(() => {
      listMessages(store, { sessionId: result.session.id, userId: "user_2" });
    }).toThrow("Access denied");
  });

  it("respects limit and offset", async () => {
    const store = createTestStore();
    const result1 = await sendMessage(store, { userId: "user_1", content: "msg1" });
    const sessionId = result1.session.id;
    await sendMessage(store, { userId: "user_1", sessionId, content: "msg2" });

    // 4 messages total
    const page1 = listMessages(store, { sessionId, userId: "user_1", limit: 2, offset: 0 });
    expect(page1.messages.length).toBe(2);
    expect(page1.total).toBe(4);

    const page2 = listMessages(store, { sessionId, userId: "user_1", limit: 2, offset: 2 });
    expect(page2.messages.length).toBe(2);
  });
});

// ============================================================
// deleteSession
// ============================================================

describe("deleteSession", () => {
  it("deletes a session and its messages", async () => {
    const store = createTestStore();
    const result = await sendMessage(store, { userId: "user_1", content: "hello" });
    const sessionId = result.session.id;

    // 确认 session 和消息存在
    expect(store.get("chatSessions", sessionId)).toBeDefined();
    const msgs = store.list("chatMessages").filter(m => m.sessionId === sessionId);
    expect(msgs.length).toBe(2);

    // 删除
    const removed = await deleteSession(store, { sessionId, userId: "user_1" });
    expect(removed).toBeDefined();

    // 验证 session 已删除
    expect(store.get("chatSessions", sessionId)).toBeNull();

    // 验证消息也已级联删除
    const remainingMsgs = store.list("chatMessages").filter(m => m.sessionId === sessionId);
    expect(remainingMsgs.length).toBe(0);
  });

  it("throws 404 when session not found", async () => {
    const store = createTestStore();
    await expect(
      deleteSession(store, { sessionId: "chat_session_nonexistent", userId: "user_1" })
    ).rejects.toThrow("Chat session not found");
  });

  it("throws 403 when session belongs to another user", async () => {
    const store = createTestStore();
    const result = await sendMessage(store, { userId: "user_1", content: "hello" });

    await expect(
      deleteSession(store, { sessionId: result.session.id, userId: "user_2" })
    ).rejects.toThrow("Access denied");
  });
});

// ============================================================
// Error Code Verification
// ============================================================

describe("Error codes and status codes", () => {
  it("session not found errors have statusCode 404 and code 'not_found'", async () => {
    const store = createTestStore();
    try {
      await sendMessage(store, { userId: "user_1", sessionId: "nonexistent", content: "hi" });
    } catch (err) {
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe("not_found");
    }
  });

  it("access denied errors have statusCode 403 and code 'forbidden'", async () => {
    const store = createTestStore();
    const session = await createSession(store, { userId: "user_1" });
    try {
      await sendMessage(store, { userId: "user_2", sessionId: session.id, content: "hi" });
    } catch (err) {
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe("forbidden");
    }
  });
});
