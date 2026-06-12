import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const DEV_SECRET = "vocos-local-dev-key-encryption-secret";

export function encryptProviderKey(plainText, env = process.env) {
  if (!plainText || typeof plainText !== "string") {
    throw new Error("Provider API key is required");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptProviderKey(encryptedValue, env = process.env) {
  if (!encryptedValue) return null;
  const [version, ivBase64, tagBase64, encryptedBase64] = String(encryptedValue).split(":");
  if (version !== "v1" || !ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error("Unsupported provider key encryption format");
  }

  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(env), Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

export function maskProviderKey(value) {
  if (!value) return null;
  const text = String(value);
  if (text.length <= 8) return `${text.slice(0, 2)}****`;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

export function getStoredProviderSecrets(store) {
  const secrets = {};
  const keyMeta = {};

  for (const provider of store.list("modelProviders")) {
    if (!provider.apiKeyEncrypted) continue;
    try {
      const apiKey = decryptProviderKey(provider.apiKeyEncrypted);
      secrets[provider.providerName] = apiKey;
      keyMeta[provider.providerName] = {
        source: "store",
        keyMasked: provider.apiKeyMasked ?? maskProviderKey(apiKey),
        updatedAt: provider.keyUpdatedAt ?? provider.updatedAt ?? null,
        encryption: process.env.VOCOS_KEY_ENCRYPTION_SECRET ? "env_secret" : "local_dev_secret"
      };
    } catch (error) {
      keyMeta[provider.providerName] = {
        source: "store_error",
        keyMasked: provider.apiKeyMasked ?? "encrypted",
        updatedAt: provider.keyUpdatedAt ?? provider.updatedAt ?? null,
        encryption: "unreadable",
        error: error.message
      };
    }
  }

  return { secrets, keyMeta };
}

export async function saveProviderKey({ store, providerName, apiKey, actor = "user_demo" }) {
  let provider = store.find("modelProviders", (candidate) => candidate.providerName === providerName);

  // Bug 修复：如果 provider 记录不存在，自动创建（upsert 模式）
  // 这样删除密钥后重新添加时不会因为找不到记录而失败
  if (!provider) {
    const DEFAULT_BASE_URLS = {
      deepseek: "https://api.deepseek.com",
      openai: "https://api.openai.com/v1",
      qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1"
    };
    const baseUrl = DEFAULT_BASE_URLS[providerName];
    if (!baseUrl) {
      const error = new Error(`Unknown provider: ${providerName}`);
      error.statusCode = 404;
      error.code = "not_found";
      throw error;
    }

    const nowValue = new Date().toISOString();
    provider = {
      id: `provider_${providerName}`,
      providerName,
      baseUrl,
      status: "needs_key",
      createdAt: nowValue,
      updatedAt: nowValue
    };
    await store.insert("modelProviders", provider);
  }

  const encrypted = encryptProviderKey(apiKey);
  const masked = maskProviderKey(apiKey);
  const updated = await store.update("modelProviders", provider.id, {
    apiKeyEncrypted: encrypted,
    apiKeyMasked: masked,
    keyUpdatedAt: new Date().toISOString(),
    keyUpdatedBy: actor,
    status: "configured"
  });

  return sanitizeProviderRecord(updated);
}

export async function deleteProviderKey({ store, providerName }) {
  const provider = store.find("modelProviders", (candidate) => candidate.providerName === providerName);
  if (!provider) {
    // Bug 修复：如果 provider 记录不存在，不再抛出错误，而是返回一个默认的已清除状态
    // 这避免了删除不存在的记录时导致前端无法操作的边界情况
    const DEFAULT_BASE_URLS = {
      deepseek: "https://api.deepseek.com",
      openai: "https://api.openai.com/v1",
      qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1"
    };
    return {
      id: `provider_${providerName}`,
      providerName,
      baseUrl: DEFAULT_BASE_URLS[providerName] || "",
      status: "needs_key",
      apiKeyMasked: null,
      keyUpdatedAt: null,
      keyUpdatedBy: null,
      updatedAt: new Date().toISOString()
    };
  }

  const updated = await store.update("modelProviders", provider.id, {
    apiKeyEncrypted: null,
    apiKeyMasked: null,
    keyUpdatedAt: null,
    keyUpdatedBy: null,
    status: "needs_key"
  });

  return sanitizeProviderRecord(updated);
}

export function sanitizeProviderRecord(provider) {
  if (!provider) return null;
  const { apiKeyEncrypted, ...safe } = provider;
  return safe;
}

function getEncryptionKey(env) {
  const secret = env.VOCOS_KEY_ENCRYPTION_SECRET || DEV_SECRET;
  return createHash("sha256").update(secret).digest();
}
