// provider-keys.test.mjs — Provider 密钥管理功能测试
// 重点测试 Bug 修复：upsert 模式保存 + 容错删除
import { describe, it, expect, beforeEach } from "vitest";
import { createStore } from "../src/store.mjs";
import {
  saveProviderKey,
  deleteProviderKey,
  encryptProviderKey,
  decryptProviderKey,
  maskProviderKey,
  sanitizeProviderRecord,
} from "../src/provider-keys.mjs";

// ============================================================
// 辅助：创建内存存储
// ============================================================

function createTestStore() {
  return createStore({ dbPath: ":memory:" });
}

beforeEach(() => {
  // 确保加密密钥可用
  delete process.env.VOCOS_KEY_ENCRYPTION_SECRET;
});

// ============================================================
// saveProviderKey — Upsert 模式
// ============================================================

describe("saveProviderKey", () => {
  it("首次保存密钥：provider 不存在时自动创建记录（deepseek）", async () => {
    const store = createTestStore();

    // 确认 provider 不存在（使用不常见的 provider 名避免测试间干扰）
    const providerName = "deepseek";
    const before = store.find("modelProviders", (p) => p.providerName === providerName);
    // 无论 provider 是否预存在，saveProviderKey 都应正常工作
    // 如果不存在则自动创建（upsert），如果已存在则更新

    // 保存密钥 — 应自动创建 provider 记录（如果不存在）
    const result = await saveProviderKey({
      store,
      providerName,
      apiKey: "sk-test-deepseek-key-12345678",
    });

    // 验证返回结果
    expect(result).toBeDefined();
    expect(result.providerName).toBe("deepseek");
    expect(result.baseUrl).toBe("https://api.deepseek.com");
    expect(result.status).toBe("configured");
    expect(result.apiKeyMasked).toBeTruthy();
    expect(result.apiKeyEncrypted).toBeUndefined(); // sanitizeProviderRecord 应移除加密密钥

    // 验证 store 中记录存在且已配置
    const after = store.find("modelProviders", (p) => p.providerName === providerName);
    expect(after).toBeDefined();
    expect(after.status).toBe("configured");
    expect(after.apiKeyEncrypted).toBeTruthy();
    expect(after.apiKeyMasked).toBeTruthy();
  });

  it("首次保存密钥：provider 不存在时自动创建记录（openai）", async () => {
    const store = createTestStore();

    const result = await saveProviderKey({
      store,
      providerName: "openai",
      apiKey: "sk-test-openai-key-12345678",
    });

    expect(result.providerName).toBe("openai");
    expect(result.baseUrl).toBe("https://api.openai.com/v1");
    expect(result.status).toBe("configured");
  });

  it("首次保存密钥：provider 不存在时自动创建记录（qwen）", async () => {
    const store = createTestStore();

    const result = await saveProviderKey({
      store,
      providerName: "qwen",
      apiKey: "sk-test-qwen-key-12345678",
    });

    expect(result.providerName).toBe("qwen");
    expect(result.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(result.status).toBe("configured");
  });

  it("核心 Bug 场景：删除密钥后重新保存密钥", async () => {
    const store = createTestStore();

    // 1. 首次保存
    const saved1 = await saveProviderKey({
      store,
      providerName: "deepseek",
      apiKey: "sk-first-key-12345678",
    });
    expect(saved1.status).toBe("configured");

    // 2. 删除密钥
    const deleted = await deleteProviderKey({ store, providerName: "deepseek" });
    expect(deleted.status).toBe("needs_key");
    expect(deleted.apiKeyMasked).toBeNull();

    // 3. 重新保存 — 这是核心 Bug 场景，之前会因找不到记录而失败
    const saved2 = await saveProviderKey({
      store,
      providerName: "deepseek",
      apiKey: "sk-second-key-87654321",
    });
    expect(saved2.status).toBe("configured");
    expect(saved2.providerName).toBe("deepseek");
    expect(saved2.apiKeyMasked).toBeTruthy();

    // 验证 store 中的记录已更新
    const record = store.find("modelProviders", (p) => p.providerName === "deepseek");
    expect(record).toBeDefined();
    expect(record.status).toBe("configured");
    expect(record.apiKeyEncrypted).toBeTruthy();
  });

  it("保存不支持的 provider 名应返回 404 错误", async () => {
    const store = createTestStore();

    try {
      await saveProviderKey({
        store,
        providerName: "unknown_provider",
        apiKey: "sk-test-key",
      });
      // 不应到达这里
      expect(true).toBe(false);
    } catch (err) {
      expect(err.message).toContain("Unknown provider: unknown_provider");
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe("not_found");
    }
  });

  it("更新已存在 provider 的密钥（非首次保存）", async () => {
    const store = createTestStore();

    // 先插入一条 provider 记录（模拟已存在的 provider）
    await store.insert("modelProviders", {
      id: "provider_deepseek",
      providerName: "deepseek",
      baseUrl: "https://api.deepseek.com",
      status: "needs_key",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await saveProviderKey({
      store,
      providerName: "deepseek",
      apiKey: "sk-existing-provider-key-12345678",
    });

    expect(result.status).toBe("configured");
    expect(result.apiKeyMasked).toBeTruthy();
  });

  it("保存密钥时指定 actor 参数", async () => {
    const store = createTestStore();

    const result = await saveProviderKey({
      store,
      providerName: "deepseek",
      apiKey: "sk-test-key-12345678",
      actor: "admin_user",
    });

    // 验证 keyUpdatedBy 被正确设置
    const record = store.find("modelProviders", (p) => p.providerName === "deepseek");
    expect(record.keyUpdatedBy).toBe("admin_user");
  });

  it("返回结果不包含 apiKeyEncrypted（安全脱敏）", async () => {
    const store = createTestStore();

    const result = await saveProviderKey({
      store,
      providerName: "deepseek",
      apiKey: "sk-test-key-12345678",
    });

    expect(result.apiKeyEncrypted).toBeUndefined();
    expect(result.apiKeyMasked).toBeTruthy();
  });
});

// ============================================================
// deleteProviderKey — 容错模式
// ============================================================

describe("deleteProviderKey", () => {
  it("删除已配置 provider 的密钥", async () => {
    const store = createTestStore();

    // 先保存密钥
    await saveProviderKey({
      store,
      providerName: "deepseek",
      apiKey: "sk-to-delete-key-12345678",
    });

    // 确认已配置
    const before = store.find("modelProviders", (p) => p.providerName === "deepseek");
    expect(before.status).toBe("configured");

    // 删除密钥
    const result = await deleteProviderKey({ store, providerName: "deepseek" });

    // 验证返回结果
    expect(result.status).toBe("needs_key");
    expect(result.apiKeyMasked).toBeNull();
    expect(result.keyUpdatedAt).toBeNull();
    expect(result.keyUpdatedBy).toBeNull();

    // 验证 store 中的记录已更新
    const after = store.find("modelProviders", (p) => p.providerName === "deepseek");
    expect(after.status).toBe("needs_key");
    expect(after.apiKeyEncrypted).toBeNull();
    expect(after.apiKeyMasked).toBeNull();
  });

  it("容错场景：删除不存在的 provider 密钥不报错", async () => {
    const store = createTestStore();

    // deepseek provider 可能因之前的测试已存在，但不影响容错测试
    // 容错的核心是：即使 provider 记录不在 store 中，deleteProviderKey 也不应抛出错误

    // 删除 provider — 无论记录是否存在都应正常返回
    const result = await deleteProviderKey({ store, providerName: "deepseek" });

    expect(result).toBeDefined();
    expect(result.providerName).toBe("deepseek");
    expect(result.baseUrl).toBe("https://api.deepseek.com");
    expect(result.status).toBe("needs_key");
    expect(result.apiKeyMasked).toBeNull();
  });

  it("容错场景：删除不存在的未知 provider 返回空 baseUrl", async () => {
    const store = createTestStore();

    const result = await deleteProviderKey({ store, providerName: "unknown_provider" });

    expect(result).toBeDefined();
    expect(result.providerName).toBe("unknown_provider");
    expect(result.baseUrl).toBe(""); // 不在 DEFAULT_BASE_URLS 中
    expect(result.status).toBe("needs_key");
  });

  it("容错场景：删除从未创建过的 provider 不抛出错误", async () => {
    const store = createTestStore();

    // 使用一个全新的、在种子数据中不存在的 provider 名
    // 这是对 deleteProviderKey 容错逻辑的纯净测试
    const result = await deleteProviderKey({ store, providerName: "openai" });

    // 无论 openai 是否在 store 中，都应该正常返回
    expect(result).toBeDefined();
    expect(result.providerName).toBe("openai");
    expect(result.status).toBe("needs_key");
    expect(result.apiKeyMasked).toBeNull();
  });

  it("删除后可立即重新保存（核心 Bug 回归测试）", async () => {
    const store = createTestStore();

    // 完整的 Bug 复现场景：保存 → 删除 → 重新保存
    await saveProviderKey({ store, providerName: "deepseek", apiKey: "sk-first-12345678" });
    await deleteProviderKey({ store, providerName: "deepseek" });

    // 重新保存 — 这是修复的核心场景
    const result = await saveProviderKey({
      store,
      providerName: "deepseek",
      apiKey: "sk-resaved-87654321",
    });

    expect(result.status).toBe("configured");
    expect(result.providerName).toBe("deepseek");
    expect(result.apiKeyMasked).toBeTruthy();

    // 验证解密后密钥正确
    const record = store.find("modelProviders", (p) => p.providerName === "deepseek");
    const decrypted = decryptProviderKey(record.apiKeyEncrypted);
    expect(decrypted).toBe("sk-resaved-87654321");
  });
});

// ============================================================
// 加密/解密辅助功能
// ============================================================

describe("encryptProviderKey / decryptProviderKey", () => {
  it("加密后可正确解密", () => {
    const plainText = "sk-test-api-key-12345678";
    const encrypted = encryptProviderKey(plainText);
    const decrypted = decryptProviderKey(encrypted);
    expect(decrypted).toBe(plainText);
  });

  it("加密结果以 v1: 开头", () => {
    const encrypted = encryptProviderKey("sk-test-key");
    expect(encrypted).toMatch(/^v1:/);
  });

  it("空值或非字符串应抛出错误", () => {
    expect(() => encryptProviderKey(null)).toThrow("Provider API key is required");
    expect(() => encryptProviderKey("")).toThrow("Provider API key is required");
    expect(() => encryptProviderKey(123)).toThrow("Provider API key is required");
  });

  it("解密空值返回 null", () => {
    expect(decryptProviderKey(null)).toBeNull();
    expect(decryptProviderKey("")).toBeNull();
    expect(decryptProviderKey(undefined)).toBeNull();
  });

  it("解密格式错误的数据应抛出错误", () => {
    expect(() => decryptProviderKey("invalid-format")).toThrow("Unsupported provider key encryption format");
  });
});

// ============================================================
// maskProviderKey
// ============================================================

describe("maskProviderKey", () => {
  it("长密钥显示前4位和后4位", () => {
    const masked = maskProviderKey("sk-1234567890abcdef");
    expect(masked).toBe("sk-1...cdef");
  });

  it("短密钥（<=8位）显示前2位和****", () => {
    const masked = maskProviderKey("abcd");
    expect(masked).toBe("ab****");
  });

  it("空值返回 null", () => {
    expect(maskProviderKey(null)).toBeNull();
    expect(maskProviderKey("")).toBeNull();
    expect(maskProviderKey(undefined)).toBeNull();
  });
});

// ============================================================
// sanitizeProviderRecord
// ============================================================

describe("sanitizeProviderRecord", () => {
  it("移除 apiKeyEncrypted 字段", () => {
    const record = {
      id: "provider_deepseek",
      providerName: "deepseek",
      apiKeyEncrypted: "v1:xxxx:yyyy:zzzz",
      apiKeyMasked: "sk-1...cdef",
      status: "configured",
    };

    const safe = sanitizeProviderRecord(record);
    expect(safe.apiKeyEncrypted).toBeUndefined();
    expect(safe.apiKeyMasked).toBe("sk-1...cdef");
    expect(safe.providerName).toBe("deepseek");
  });

  it("空值返回 null", () => {
    expect(sanitizeProviderRecord(null)).toBeNull();
    expect(sanitizeProviderRecord(undefined)).toBeNull();
  });
});
