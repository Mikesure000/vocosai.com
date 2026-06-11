// AI 聊天服务 —— 会话管理、消息收发、提供商路由
import { createId, now } from "./store.mjs";
import { resolveProviderRoute, fetchChatCompletion, getProviderBaseUrl, isLiveModelEnabled } from "./model-adapters.mjs";
import { getStoredProviderSecrets } from "./provider-keys.mjs";

const CHAT_CONTEXT_WINDOW = 20;

/**
 * 创建聊天会话
 * @param {object} store - 数据存储实例
 * @param {object} params - 创建参数
 * @param {string} params.userId - 用户 ID
 * @param {string} [params.teamId] - 团队 ID
 * @param {string} [params.providerName] - 指定提供商名称
 * @param {string} [params.modelName] - 指定模型名称
 * @returns {Promise<object>} 创建的会话对象
 */
export async function createSession(store, { userId, teamId, providerName, modelName }) {
  const session = {
    id: createId("chat_session"),
    userId,
    teamId: teamId || null,
    providerName: providerName || null,
    modelName: modelName || null,
    title: null,
    messageCount: 0,
    lastMessageAt: null,
    createdAt: now(),
    updatedAt: now()
  };
  await store.insert("chatSessions", session);
  return session;
}

/**
 * 发送聊天消息 — 核心聊天逻辑
 * @param {object} store - 数据存储实例
 * @param {object} params - 发送参数
 * @param {string} params.userId - 用户 ID
 * @param {string} [params.teamId] - 团队 ID
 * @param {string} [params.sessionId] - 会话 ID（为空则自动创建）
 * @param {string} params.content - 用户消息内容
 * @param {string} [params.providerName] - 指定提供商名称
 * @returns {Promise<object>} { session, userMessage, assistantMessage }
 */
export async function sendMessage(store, { userId, teamId, sessionId, content, providerName }) {
  // 1. 获取或创建会话
  let session;
  if (sessionId) {
    session = store.get("chatSessions", sessionId);
    if (!session) {
      const error = new Error("Chat session not found");
      error.statusCode = 404;
      error.code = "not_found";
      throw error;
    }
    if (session.userId !== userId) {
      const error = new Error("Access denied: session belongs to another user");
      error.statusCode = 403;
      error.code = "forbidden";
      throw error;
    }
  } else {
    session = await createSession(store, {
      userId,
      teamId,
      providerName
    });
  }

  // 2. 插入用户消息
  const userMessage = {
    id: createId("chat_msg"),
    sessionId: session.id,
    role: "user",
    content,
    providerName: null,
    modelName: null,
    tokenCount: 0,
    createdAt: now()
  };
  await store.insert("chatMessages", userMessage);

  // 3. 获取最近消息构建上下文
  const allMessages = store.list("chatMessages")
    .filter((msg) => msg.sessionId === session.id)
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
  const contextMessages = allMessages.slice(-CHAT_CONTEXT_WINDOW);
  const messages = contextMessages.map((msg) => ({
    role: msg.role,
    content: msg.content
  }));

  // 4. 获取凭证 & 解析路由
  const providerRuntime = getStoredProviderSecrets(store);
  const effectiveProviderName = providerName || session.providerName;
  let route;
  let credentials;

  if (effectiveProviderName && effectiveProviderName !== "auto") {
    // 用户指定了提供商
    const env = process.env;
    const envKeyMap = {
      deepseek: "DEEPSEEK_API_KEY",
      openai: "OPENAI_API_KEY",
      qwen: "QWEN_API_KEY"
    };
    const apiKey = env[envKeyMap[effectiveProviderName]] || providerRuntime.secrets?.[effectiveProviderName];
    credentials = {
      providerName: effectiveProviderName,
      baseUrl: getProviderBaseUrl(effectiveProviderName, env),
      apiKey
    };
    const agent = { code: "chat_agent", version: "1.0.0" };
    const modelMap = {
      deepseek: () => env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      openai: () => env.OPENAI_MODEL || "gpt-4.1",
      qwen: () => env.QWEN_MODEL || "qwen-plus"
    };
    route = {
      providerName: effectiveProviderName,
      modelName: session.modelName || modelMap[effectiveProviderName]?.() || "unknown"
    };
  } else {
    // 自动路由
    const agent = { code: "chat_agent", version: "1.0.0" };
    route = resolveProviderRoute(agent, "auto");
    credentials = {
      providerName: route.providerName,
      baseUrl: getProviderBaseUrl(route.providerName, process.env),
      apiKey: process.env[`${route.providerName.toUpperCase()}_API_KEY`] || providerRuntime.secrets?.[route.providerName]
    };
  }

  // 5. 调用 AI 模型（聊天场景不强制 JSON 输出）
  let assistantContent = "";
  let usedProviderName = route.providerName;
  let usedModelName = route.modelName;

  if (!isLiveModelEnabled()) {
    // Mock 模式 — 无需 API Key，直接返回模拟回复
    assistantContent = `[Mock 回复] 收到您的消息："${content.slice(0, 50)}${content.length > 50 ? "..." : ""}"。当前处于 Mock 模式，请配置 AI 提供商密钥以获取真实回复。`;
  } else if (!credentials.apiKey) {
    assistantContent = "⚠️ 当前未配置 AI 提供商密钥，无法获取 AI 回复。请在「系统管理 → AI 提供商配置」中设置 API Key。";
  } else {
    try {
      const response = await fetchChatCompletion({
        credentials,
        modelName: route.modelName,
        messages,
        timeoutMs: 90000,
        responseFormat: null // 聊天场景不强制 JSON 格式
      });
      assistantContent = response.choices?.[0]?.message?.content ?? "（AI 未返回有效内容）";
    } catch (error) {
      // 主提供商失败，尝试回退
      if (route.fallbackProviderName && route.fallbackModelName) {
        try {
          const fallbackCredentials = {
            providerName: route.fallbackProviderName,
            baseUrl: getProviderBaseUrl(route.fallbackProviderName, process.env),
            apiKey: process.env[`${route.fallbackProviderName.toUpperCase()}_API_KEY`] || providerRuntime.secrets?.[route.fallbackProviderName]
          };
          if (fallbackCredentials.apiKey) {
            const fallbackResponse = await fetchChatCompletion({
              credentials: fallbackCredentials,
              modelName: route.fallbackModelName,
              messages,
              timeoutMs: 90000,
              responseFormat: null
            });
            assistantContent = fallbackResponse.choices?.[0]?.message?.content ?? "（AI 未返回有效内容）";
            usedProviderName = route.fallbackProviderName;
            usedModelName = route.fallbackModelName;
          } else {
            assistantContent = `⚠️ AI 回复失败：${error.message}。回退提供商 ${route.fallbackProviderName} 也未配置密钥。`;
          }
        } catch (fallbackError) {
          assistantContent = `⚠️ AI 回复失败：主提供商 ${error.message}；回退提供商 ${fallbackError.message}。`;
        }
      } else {
        assistantContent = `⚠️ AI 回复失败：${error.message}`;
      }
    }
  }

  // 6. 插入 assistant 消息
  const assistantMessage = {
    id: createId("chat_msg"),
    sessionId: session.id,
    role: "assistant",
    content: assistantContent,
    providerName: usedProviderName,
    modelName: usedModelName,
    tokenCount: 0,
    createdAt: now()
  };
  await store.insert("chatMessages", assistantMessage);

  // 7. 更新会话信息
  const updatedMessageCount = (session.messageCount || 0) + 2;
  const title = session.title || content.slice(0, 50) + (content.length > 50 ? "..." : "");
  await store.update("chatSessions", session.id, {
    messageCount: updatedMessageCount,
    lastMessageAt: now(),
    title,
    providerName: usedProviderName,
    modelName: usedModelName
  });

  const updatedSession = store.get("chatSessions", session.id);

  return {
    session: updatedSession,
    userMessage,
    assistantMessage
  };
}

/**
 * 列出用户的聊天会话
 * @param {object} store - 数据存储实例
 * @param {object} params - 查询参数
 * @param {string} params.userId - 用户 ID
 * @param {number} [params.limit=50] - 返回数量上限
 * @param {number} [params.offset=0] - 偏移量
 * @returns {object} { sessions, total }
 */
export function listSessions(store, { userId, limit = 50, offset = 0 }) {
  const allSessions = store.list("chatSessions")
    .filter((session) => session.userId === userId)
    .sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")));

  return {
    sessions: allSessions.slice(offset, offset + limit),
    total: allSessions.length
  };
}

/**
 * 列出会话消息（校验 userId）
 * @param {object} store - 数据存储实例
 * @param {object} params - 查询参数
 * @param {string} params.sessionId - 会话 ID
 * @param {string} params.userId - 用户 ID（用于权限校验）
 * @param {number} [params.limit=100] - 返回数量上限
 * @param {number} [params.offset=0] - 偏移量
 * @returns {object} { messages, total }
 */
export function listMessages(store, { sessionId, userId, limit = 100, offset = 0 }) {
  const session = store.get("chatSessions", sessionId);
  if (!session) {
    const error = new Error("Chat session not found");
    error.statusCode = 404;
    error.code = "not_found";
    throw error;
  }
  if (session.userId !== userId) {
    const error = new Error("Access denied: session belongs to another user");
    error.statusCode = 403;
    error.code = "forbidden";
    throw error;
  }

  const allMessages = store.list("chatMessages")
    .filter((msg) => msg.sessionId === sessionId)
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));

  return {
    messages: allMessages.slice(offset, offset + limit),
    total: allMessages.length
  };
}

/**
 * 删除聊天会话（级联删除消息）
 * @param {object} store - 数据存储实例
 * @param {object} params - 删除参数
 * @param {string} params.sessionId - 会话 ID
 * @param {string} params.userId - 用户 ID（用于权限校验）
 * @returns {Promise<object>} 删除的会话对象
 */
export async function deleteSession(store, { sessionId, userId }) {
  const session = store.get("chatSessions", sessionId);
  if (!session) {
    const error = new Error("Chat session not found");
    error.statusCode = 404;
    error.code = "not_found";
    throw error;
  }
  if (session.userId !== userId) {
    const error = new Error("Access denied: session belongs to another user");
    error.statusCode = 403;
    error.code = "forbidden";
    throw error;
  }

  // 删除会话消息
  const messages = store.list("chatMessages")
    .filter((msg) => msg.sessionId === sessionId);
  for (const msg of messages) {
    await store.delete("chatMessages", msg.id);
  }

  // 删除会话
  const removed = await store.delete("chatSessions", sessionId);
  return removed;
}
