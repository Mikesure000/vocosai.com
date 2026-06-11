// model-adapters-qwen.test.mjs — 千问提供商 & 路由逻辑测试
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getProviderStatuses,
  getProviderBaseUrl,
  resolveProviderRoute,
  fetchChatCompletion,
  isLiveModelEnabled
} from "../src/model-adapters.mjs";

beforeEach(() => {
  // 保存原始环境变量
  process.env.VOCOS_JWT_SECRET = "test-secret-for-vitest-a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
});

// ============================================================
// DEFAULTS - 千问配置
// ============================================================

describe("DEFAULTS: qwen configuration", () => {
  it("qwen has correct baseUrl", () => {
    const url = getProviderBaseUrl("qwen");
    expect(url).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
  });

  it("qwen has correct default model", () => {
    const statuses = getProviderStatuses();
    const qwen = statuses.find(s => s.providerName === "qwen");
    expect(qwen).toBeDefined();
    expect(qwen.defaultModel).toBe("qwen-plus");
  });

  it("qwen has correct reasoning model", () => {
    const statuses = getProviderStatuses();
    const qwen = statuses.find(s => s.providerName === "qwen");
    expect(qwen.reasoningModel).toBe("qwen-max");
  });
});

// ============================================================
// getProviderStatuses
// ============================================================

describe("getProviderStatuses", () => {
  it("returns qwen in statuses", () => {
    const statuses = getProviderStatuses();
    const qwen = statuses.find(s => s.providerName === "qwen");
    expect(qwen).toBeDefined();
  });

  it("returns 3 providers (deepseek, openai, qwen)", () => {
    const statuses = getProviderStatuses();
    expect(statuses.length).toBe(3);
    const names = statuses.map(s => s.providerName).sort();
    expect(names).toEqual(["deepseek", "openai", "qwen"]);
  });

  it("qwen shows configured when QWEN_API_KEY is set", () => {
    const original = process.env.QWEN_API_KEY;
    process.env.QWEN_API_KEY = "test-key";
    try {
      const statuses = getProviderStatuses(process.env);
      const qwen = statuses.find(s => s.providerName === "qwen");
      expect(qwen.configured).toBe(true);
      expect(qwen.source).toBe("env");
    } finally {
      if (!original) delete process.env.QWEN_API_KEY;
      else process.env.QWEN_API_KEY = original;
    }
  });

  it("qwen shows not configured when no key", () => {
    const env = { ...process.env };
    delete env.QWEN_API_KEY;
    const statuses = getProviderStatuses(env, {});
    const qwen = statuses.find(s => s.providerName === "qwen");
    expect(qwen.configured).toBe(false);
  });

  it("qwen gets priority when VOCOS_PRIMARY_PROVIDER=qwen", () => {
    const env = { ...process.env, VOCOS_PRIMARY_PROVIDER: "qwen" };
    const statuses = getProviderStatuses(env);
    expect(statuses[0].providerName).toBe("qwen");
  });

  it("supports providerRuntime secrets for qwen", () => {
    const env = { ...process.env };
    delete env.QWEN_API_KEY;
    const statuses = getProviderStatuses(env, { secrets: { qwen: "stored-key" } });
    const qwen = statuses.find(s => s.providerName === "qwen");
    expect(qwen.configured).toBe(true);
  });
});

// ============================================================
// getProviderBaseUrl
// ============================================================

describe("getProviderBaseUrl", () => {
  it("returns default qwen base URL", () => {
    expect(getProviderBaseUrl("qwen")).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
  });

  it("supports custom QWEN_BASE_URL", () => {
    const env = { QWEN_BASE_URL: "https://custom-qwen.example.com/v1" };
    expect(getProviderBaseUrl("qwen", env)).toBe("https://custom-qwen.example.com/v1");
  });

  it("returns empty string for unknown provider", () => {
    expect(getProviderBaseUrl("unknown_provider")).toBe("");
  });

  it("returns correct URLs for deepseek and openai", () => {
    expect(getProviderBaseUrl("deepseek")).toBe("https://api.deepseek.com");
    expect(getProviderBaseUrl("openai")).toBe("https://api.openai.com/v1");
  });
});

// ============================================================
// resolveProviderRoute - 千问路由
// ============================================================

describe("resolveProviderRoute", () => {
  const chatAgent = { code: "chat_agent", version: "1.0.0" };

  it("routes to qwen when VOCOS_PRIMARY_PROVIDER=qwen", () => {
    const env = { VOCOS_PRIMARY_PROVIDER: "qwen" };
    const route = resolveProviderRoute(chatAgent, "auto", env);
    expect(route.providerName).toBe("qwen");
    expect(route.modelName).toBeTruthy();
  });

  it("routes to qwen when model name contains 'qwen'", () => {
    const route = resolveProviderRoute(chatAgent, "qwen-plus");
    expect(route.providerName).toBe("qwen");
    expect(route.modelName).toBe("qwen-plus");
    expect(route.fallbackProviderName).toBe("deepseek");
  });

  it("qwen route has correct fallback", () => {
    const env = { VOCOS_PRIMARY_PROVIDER: "qwen" };
    const route = resolveProviderRoute(chatAgent, "auto", env);
    expect(route.fallbackProviderName).toBe("deepseek");
  });

  it("qwen reasoning agent gets reasoning model", () => {
    const reasoningAgent = { code: "platform_strategy_agent", version: "1.0.0" };
    const env = { VOCOS_PRIMARY_PROVIDER: "qwen" };
    const route = resolveProviderRoute(reasoningAgent, "auto", env);
    expect(route.providerName).toBe("qwen");
    expect(route.modelName).toBe("qwen-max"); // reasoning model
  });

  it("default route goes to deepseek when no preference", () => {
    const env = {};
    const route = resolveProviderRoute(chatAgent, "auto", env);
    expect(route.providerName).toBe("deepseek");
  });
});

// ============================================================
// fetchChatCompletion - 导出验证
// ============================================================

describe("fetchChatCompletion export", () => {
  it("is an exported function", () => {
    expect(typeof fetchChatCompletion).toBe("function");
  });
});

// ============================================================
// isLiveModelEnabled
// ============================================================

describe("isLiveModelEnabled", () => {
  it("returns true when VOCOS_MODEL_MODE is not 'mock'", () => {
    const original = process.env.VOCOS_MODEL_MODE;
    delete process.env.VOCOS_MODEL_MODE;
    expect(isLiveModelEnabled()).toBe(true);
    if (original) process.env.VOCOS_MODEL_MODE = original;
  });

  it("returns false when VOCOS_MODEL_MODE is 'mock'", () => {
    process.env.VOCOS_MODEL_MODE = "mock";
    expect(isLiveModelEnabled()).toBe(false);
  });
});

// ============================================================
// routeFromModelName - 模型名路由
// ============================================================

describe("routeFromModelName via resolveProviderRoute", () => {
  const agent = { code: "chat_agent", version: "1.0.0" };

  it("recognizes 'qwen-max' as qwen provider", () => {
    const route = resolveProviderRoute(agent, "qwen-max");
    expect(route.providerName).toBe("qwen");
  });

  it("recognizes 'deepseek-v4-flash' as deepseek provider", () => {
    const route = resolveProviderRoute(agent, "deepseek-v4-flash");
    expect(route.providerName).toBe("deepseek");
  });

  it("defaults non-deepseek non-qwen model names to openai", () => {
    const route = resolveProviderRoute(agent, "gpt-4.1");
    expect(route.providerName).toBe("openai");
  });
});
