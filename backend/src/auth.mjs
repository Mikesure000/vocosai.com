// Vocos 认证授权模块 — Phase 1 完整实现
// 零外部依赖，仅使用 Node.js 内置 crypto 模块
// 参考: docs/ARCH-AUTH.md, docs/TASKS-AUTH.md, docs/PRD-AUTH.md

import crypto from "node:crypto";

// ============================================================
// 常量定义
// ============================================================

export const JWT_SECRET =
  process.env.VOCOS_JWT_SECRET || "vocos-dev-secret-change-in-production";

const SCRYPT_KEYLEN = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

// ============================================================
// T-AUTH-01: PERMISSIONS 权限枚举扩展 + 角色权限映射表
// ============================================================

export const PERMISSIONS = {
  TASK_READ: "task.read",
  TASK_WRITE: "task.write",
  AI_RUN_READ: "ai_run.read",
  AI_RUN_WRITE: "ai_run.write",
  REPORT_READ: "report.read",
  REPORT_WRITE: "report.write",
  COST_READ: "cost.read",
  QUALITY_READ: "quality.read",
  AUDIT_READ: "audit.read",
  SCHEMA_READ: "schema.read",
  SCHEMA_WRITE: "schema.write",
  PROMPT_READ: "prompt.read",
  PROMPT_WRITE: "prompt.write",
  MODEL_READ: "model.read",
  MODEL_WRITE: "model.write",
  TEAM_MANAGE: "team.manage",
  USER_MANAGE: "user.manage",
};

export const ROLE_PERMISSIONS = {
  super_admin: [
    "task.read",
    "task.write",
    "ai_run.read",
    "ai_run.write",
    "report.read",
    "report.write",
    "cost.read",
    "quality.read",
    "audit.read",
    "schema.read",
    "schema.write",
    "prompt.read",
    "prompt.write",
    "model.read",
    "model.write",
    "team.manage",
    "user.manage",
  ],
  team_admin: [
    "task.read",
    "task.write",
    "ai_run.read",
    "ai_run.write",
    "report.read",
    "report.write",
    "cost.read",
    "quality.read",
    "audit.read",
    "schema.read",
    "prompt.read",
    "model.read",
    "team.manage",
  ],
  ai_engineer_admin: [
    "task.read",
    "ai_run.read",
    "ai_run.write",
    "report.read",
    "quality.read",
    "schema.read",
    "schema.write",
    "prompt.read",
    "prompt.write",
    "model.read",
    "model.write",
  ],
  member: ["task.read", "ai_run.read", "report.read"],
};

// ALL_PERMISSIONS 从 ROLE_PERMISSIONS 动态计算，避免重复维护
const ALL_PERMISSIONS = [...new Set(Object.values(ROLE_PERMISSIONS).flat())];

// ============================================================
// T-AUTH-02: JWT 工具函数（signToken / verifyToken / decodeToken）
// ============================================================

/**
 * Base64 URL-safe 编码
 */
function base64urlEncode(str) {
  return Buffer.from(str).toString("base64url");
}

/**
 * Base64 URL-safe 解码
 */
function base64urlDecode(str) {
  return Buffer.from(str, "base64url").toString("utf8");
}

/**
 * 解析有效期字符串，如 "15m" / "7d" / "1h" / "30s"
 * @param {string} expiresInStr - 有效期字符串
 * @returns {number} 秒数
 */
function parseExpiresIn(expiresInStr) {
  const match = expiresInStr.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error("invalid_expires_format: " + expiresInStr);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[unit] ?? 60);
}

/**
 * 签发 JWT Token
 * @param {Object} payload - 自定义 claims（不含 iat/exp/jti，自动注入）
 * @param {string} expiresInStr - 有效期，如 "15m" / "7d"
 * @returns {string} 完整的 JWT 字符串
 */
export function signToken(payload, expiresInStr) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = parseExpiresIn(expiresInStr);

  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
    jti: crypto.randomUUID(),
  };

  const unsignedToken =
    base64urlEncode(JSON.stringify(header)) +
    "." +
    base64urlEncode(JSON.stringify(fullPayload));

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(unsignedToken)
    .digest("base64url");

  return unsignedToken + "." + signature;
}

/**
 * 验证并解析 JWT Token
 * @param {string} token - JWT 字符串
 * @returns {{ payload: Object, jti: string }} 解析后的 payload
 * @throws {Error} invalid_token | token_expired
 */
export function verifyToken(token) {
  if (!token || typeof token !== "string") {
    const err = new Error("Token is invalid");
    err.code = "invalid_token";
    throw err;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    const err = new Error("Token is invalid");
    err.code = "invalid_token";
    throw err;
  }

  // 重新计算签名
  const unsignedToken = parts[0] + "." + parts[1];
  const expectedSig = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(unsignedToken)
    .digest("base64url");

  // 恒定时间比较签名，防止时序攻击
  const providedSigBuf = Buffer.from(parts[2]);
  const expectedSigBuf = Buffer.from(expectedSig);

  if (
    providedSigBuf.length !== expectedSigBuf.length ||
    !crypto.timingSafeEqual(providedSigBuf, expectedSigBuf)
  ) {
    const err = new Error("Token is invalid");
    err.code = "invalid_token";
    throw err;
  }

  // 解码 payload
  let payload;
  try {
    payload = JSON.parse(base64urlDecode(parts[1]));
  } catch {
    const err = new Error("Token is invalid");
    err.code = "invalid_token";
    throw err;
  }

  // 检查过期
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    const err = new Error("Token has expired");
    err.code = "token_expired";
    throw err;
  }

  return { payload, jti: payload.jti };
}

/**
 * 仅解码 JWT payload（不验证签名，用于调试或前端展示）
 * @param {string} token - JWT 字符串
 * @returns {Object|null} 解码后的 payload
 */
export function decodeToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64urlDecode(parts[1]));
  } catch {
    return null;
  }
}

// ============================================================
// T-AUTH-03: 密码哈希工具函数（hashPassword + verifyPassword）
// ============================================================

/**
 * 密码哈希（注册 / 修改密码时调用）
 * @param {string} password - 明文密码
 * @returns {string} "salt_hex:hash_hex" 格式的哈希值
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return salt.toString("hex") + ":" + hash.toString("hex");
}

/**
 * hashPassword 的便捷别名
 */
export function hashAndSalt(password) {
  return hashPassword(password);
}

/**
 * 密码验证（登录 / 修改密码时调用）
 * @param {string} password - 明文密码
 * @param {string} stored - 存储的 "salt:hash" 字符串
 * @returns {boolean} 密码是否匹配
 */
export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;

  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expectedHash = Buffer.from(hashHex, "hex");
  const actualHash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  // 恒定时间比较，防止时序攻击
  if (expectedHash.length !== actualHash.length) return false;
  // timingSafeEqual 在长度匹配时不会 throw
  return crypto.timingSafeEqual(actualHash, expectedHash);
}

// ============================================================
// T-AUTH-04: Refresh Token 黑名单管理
// ============================================================

/**
 * 创建 Refresh Token 黑名单实例
 * @returns {{ add(jti, expiresAt), isBlacklisted(jti) }}
 */
function createRefreshBlacklist() {
  const store = new Map(); // Map<jti, expiresAt (ms timestamp)>

  // 定期清理过期条目（每 60 秒）
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [jti, expiresAt] of store) {
      if (expiresAt < now) {
        store.delete(jti);
      }
    }
  }, 60000);

  // 不阻止 Node.js 进程退出
  if (typeof cleanupTimer.unref === "function") {
    cleanupTimer.unref();
  }

  return {
    /**
     * 将 token 的 jti 加入黑名单
     * @param {string} jti - Token 唯一 ID
     * @param {number} expiresAt - 过期时间（毫秒时间戳）
     */
    add(jti, expiresAt) {
      store.set(jti, expiresAt);
    },

    /**
     * 检查 jti 是否在黑名单中
     * @param {string} jti - Token 唯一 ID
     * @returns {boolean}
     */
    isBlacklisted(jti) {
      if (!store.has(jti)) return false;
      const expiresAt = store.get(jti);
      // 已过期的条目实时清理
      if (expiresAt < Date.now()) {
        store.delete(jti);
        return false;
      }
      return true;
    },
  };
}

/** 模块级单例 */
export const refreshBlacklist = createRefreshBlacklist();

/**
 * 使 Refresh Token 失效
 * 从完整 token 字符串中提取 jti 并加入黑名单
 * @param {string} token - Refresh Token JWT 字符串
 * @returns {{ jti: string, family: string, exp: number }|null}
 */
export function invalidateRefreshToken(token) {
  try {
    const { payload, jti } = verifyToken(token);
    const expiresAt = payload.exp ? payload.exp * 1000 : Date.now() + 7 * 24 * 3600 * 1000;
    refreshBlacklist.add(jti, expiresAt);
    return { jti, family: payload.family, exp: payload.exp };
  } catch {
    return null;
  }
}

/**
 * 检查 Refresh Token jti 是否已被撤销
 * @param {string} jti - Token 唯一 ID
 * @returns {boolean}
 */
export function isRefreshTokenBlacklisted(jti) {
  return refreshBlacklist.isBlacklisted(jti);
}

// ============================================================
// T-AUTH-05: buildRequestContext 改造
// ============================================================

/**
 * 从请求构建认证上下文
 * @param {{ store: Object, req: IncomingMessage }} params
 * @returns {Object} 认证上下文 或 { authenticated: false, error: string }
 */
export function buildRequestContext({ store, req }) {
  const headers = req?.headers ?? {};
  const isDev = process.env.NODE_ENV === "development";

  // 公开路由跳过认证（由 server.mjs 在路由处理前设置 req._publicRoute = true）
  if (req?._publicRoute) {
    return { isPublic: true };
  }

  // 1. 尝试从 Authorization Header 提取 Bearer Token
  const authHeader = (headers["authorization"] || "").trim();
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = tokenMatch ? tokenMatch[1] : null;

  if (token) {
    try {
      const { payload } = verifyToken(token);

      // 从 DB 查询用户/团队验证数据完整性
      const user =
        store.list?.("users")?.find((u) => u.id === payload.sub) ?? null;
      if (!user || user.status !== "active") {
        return { authenticated: false, error: "User is not active" };
      }

      const team =
        store.list?.("teams")?.find((t) => t.id === payload.team_id) ?? null;
      const membership =
        store
          .list?.("teamMembers")
          ?.find(
            (m) => m.userId === payload.sub && m.teamId === payload.team_id
          ) ?? null;

      return {
        authenticated: true,
        userId: payload.sub,
        userName: payload.name || user.name,
        teamId: payload.team_id,
        teamName: payload.team_name || team?.teamName || team?.name,
        role: payload.role || membership?.role,
        permissions: payload.permissions || [],
        user,
        team,
        membership,
      };
    } catch (err) {
      return { authenticated: false, error: err.code || "unauthorized" };
    }
  }

  // 2. 开发环境降级：从 x-user-id / x-team-id Header 读取
  if (isDev) {
    const userId = headers["x-user-id"] || "user_demo";
    const teamId = headers["x-team-id"] || "team_demo";

    const user =
      store.list?.("users")?.find((u) => u.id === userId) ?? null;
    const team =
      store.list?.("teams")?.find((t) => t.id === teamId) ?? null;
    const membership =
      store
        .list?.("teamMembers")
        ?.find((m) => m.userId === userId && m.teamId === teamId) ?? null;

    const role = membership?.role ?? "super_admin";
    const permissions =
      ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.super_admin;

    return {
      authenticated: true,
      userId,
      userName: user?.name ?? "Demo User",
      teamId,
      teamName: team?.name ?? team?.teamName ?? "Demo Team",
      role,
      permissions,
      user,
      team,
      membership,
    };
  }

  // 3. 生产环境无 Token，返回未认证
  return { authenticated: false, error: "no_token" };
}

// ============================================================
// T-AUTH-06: requirePermission / assertTeamAccess / filterByTeam 真实实现
// ============================================================

/**
 * 创建 403 Forbidden 错误
 */
function forbiddenError(message) {
  const err = new Error(message || "Insufficient permissions");
  err.statusCode = 403;
  err.code = "forbidden";
  return err;
}

/**
 * 权限校验
 * @param {Object} context - 认证上下文（含 permissions 数组）
 * @param {string} permission - 所需权限
 * @throws {Error} 403 forbidden
 */
export function requirePermission(context, permission) {
  if (!context.permissions || !Array.isArray(context.permissions)) {
    throw forbiddenError("No permissions found in context");
  }
  if (!context.permissions.includes(permission)) {
    throw forbiddenError("Missing permission: " + permission);
  }
}

/**
 * 团队访问校验
 * @param {Object} context - 认证上下文（含 role / teamId）
 * @param {string} resourceTeamId - 资源所属团队 ID
 * @throws {Error} 403 forbidden
 */
export function assertTeamAccess(context, resourceTeamId) {
  // super_admin 可访问所有团队
  if (context.role === "super_admin") return;
  if (!resourceTeamId) return;
  if (context.teamId !== resourceTeamId) {
    throw forbiddenError("You do not have access to this team's resources");
  }
}

/**
 * 按团队过滤记录
 * @param {Object} context - 认证上下文
 * @param {Array} records - 记录数组
 * @returns {Array} super_admin 返回全部，否则按 teamId 过滤
 */
export function filterByTeam(context, records) {
  if (!records || !Array.isArray(records)) return records ?? [];
  if (context.role === "super_admin") return records;
  return records.filter((r) => r.teamId === context.teamId);
}

// ============================================================
// T-AUTH-07: 登录失败锁定
// ============================================================

/**
 * 创建登录失败跟踪器
 * @param {number} maxAttempts - 最大失败次数（默认 5）
 * @param {number} lockoutMinutes - 锁定分钟数（默认 15）
 * @returns {{ recordFailure, isLocked, reset }}
 */
function createLoginTracker(maxAttempts = 5, lockoutMinutes = 15) {
  const store = new Map(); // Map<identifier, { count, lockedUntil }>

  return {
    /**
     * 记录一次登录失败
     * @param {string} identifier - 邮箱或 IP
     */
    recordFailure(identifier) {
      const record = store.get(identifier) || { count: 0, lockedUntil: 0 };
      record.count += 1;
      if (record.count >= maxAttempts) {
        record.lockedUntil = Date.now() + lockoutMinutes * 60 * 1000;
      }
      store.set(identifier, record);
    },

    /**
     * 检查是否被锁定
     * @param {string} identifier - 邮箱或 IP
     * @returns {boolean}
     */
    isLocked(identifier) {
      const record = store.get(identifier);
      if (!record) return false;
      if (record.lockedUntil > Date.now()) {
        return true;
      }
      // 锁定已过期，清除记录
      store.delete(identifier);
      return false;
    },

    /**
     * 重置失败计数（登录成功后调用）
     * @param {string} identifier - 邮箱或 IP
     */
    reset(identifier) {
      store.delete(identifier);
    },
  };
}

/** 模块级单例 */
export const loginTracker = createLoginTracker();
