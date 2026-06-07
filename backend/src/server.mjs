import { createServer } from "node:http";
import { assertTeamAccess, buildRequestContext, filterByTeam, hashPassword, JWT_SECRET, loginTracker, PERMISSIONS, refreshBlacklist, requirePermission, ROLE_PERMISSIONS, signToken, verifyPassword, verifyToken } from "./auth.mjs";
import crypto from "node:crypto";
import { createId, createStore, now } from "./store.mjs";
import { buildCostSummary } from "./cost-governance.mjs";
import { buildCommentInsights, listCommentSignalMatches } from "./comment-insights.mjs";
import { buildQualitySummary } from "./quality-governance.mjs";
import { assertTransition, nextStatusForParsedFile } from "./state-machine.mjs";
import { parseCommentFileContent, parseCommentFileBuffer } from "./file-parser.mjs";
import { testProviderConnection } from "./model-adapters.mjs";
import { getModelProviderStatuses, getModelRoutes, getPipelineStages, runAgent } from "./model-gateway.mjs";
import { buildSkillMetrics, buildSkillIterationHistory } from "./skill-learn.mjs";
import { parseMultipartFormData } from "./multipart.mjs";
import { deleteProviderKey, getStoredProviderSecrets, saveProviderKey } from "./provider-keys.mjs";
import { detailReport, exportReport, generateTaskReport, summarizeReport } from "./report-generator.mjs";
import { validateJsonSchema } from "./schema-validator.mjs";
import { buildWorkbookXlsx } from "./xlsx-exporter.mjs";
import { contentDispositionAttachment } from "./text-utils.mjs";

// BL-003: 归因引擎
import { runAttribution } from "./attribution-engine.mjs";

// BL-008: 内容生产卡引擎
import { generateProductionCard } from "./production-card-engine.mjs";

// BL-009: 质检系统
import { runQualityCheck } from "./quality-check.mjs";
import { generateCommentOps } from "./comment-ops-engine.mjs";
import { scoreAdFit } from "./ad-fit-engine.mjs";
import { listReportTemplates, buildWhiteLabelReport } from "./white-label-engine.mjs";

// ============================================================
// CORS 配置
// ============================================================

// P2-7: 从环境变量读取允许的跨域来源，支持逗号分隔
const DEFAULT_DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:3000", "http://localhost:3000"];
const DEFAULT_PROD_ORIGINS = ["https://vocosai.com"];

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean).length > 0
  ? (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean)
  : (process.env.NODE_ENV === "production" ? DEFAULT_PROD_ORIGINS : DEFAULT_DEV_ORIGINS);

function getAllowOrigin(origin) {
  if (!origin) return null;
  return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

// ============================================================
// 请求限流器
// ============================================================

// TODO(P3-6): rateLimiters 和 loginTracker 存于内存，进程重启会丢失。
// 后续应持久化到 Redis 或数据库，以支持多进程/集群部署。
const rateLimiters = new Map();

function getClientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.socket?.remoteAddress ?? "127.0.0.1";
}

function checkRateLimit(key, maxAttempts, windowMs) {
  const now = Date.now();
  const record = rateLimiters.get(key) ?? { count: 0, resetAt: now + windowMs };

  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + windowMs;
  } else {
    record.count += 1;
  }

  rateLimiters.set(key, record);
  return record.count <= maxAttempts;
}

// ============================================================
// Cookie 解析
// ============================================================

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  const cookies = {};
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      cookies[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
  }
  return cookies;
}

// ============================================================
// 辅助函数
// ============================================================

function authError(code, message, statusCode = 401) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

export async function createApiServer({ dbPath = "backend/data/vocos.sqlite" } = {}) {
  // P0-1: JWT_SECRET 安全启动检查，禁止使用默认弱密钥
  if (!process.env.VOCOS_JWT_SECRET || process.env.VOCOS_JWT_SECRET === "vocos-dev-secret-change-in-production") {
    console.error("[vocos] FATAL: VOCOS_JWT_SECRET 环境变量未设置或仍为默认值。");
    console.error("[vocos] 默认 JWT Secret 是不安全的，任何人都可以伪造 JWT Token。");
    console.error("[vocos] 请在环境变量中设置安全的 VOCOS_JWT_SECRET 后重新启动。");
    console.error("[vocos] 生成建议: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"");
    process.exit(1);
  }

  const store = createStore({ dbPath });
  await store.markInterruptedPipelineJobs?.();
  const jobs = new Map();
  // P1-4: parseComments 互斥锁，防止并发调用互相覆盖
  const parsingTaskIds = new Set();

  return createServer(async (request, response) => {
    try {
      if (request.method === "OPTIONS") {
        send(response, 204, null, request);
        return;
      }

      const url = new URL(request.url, "http://127.0.0.1");
      const route = matchRoute(request.method, url.pathname);

      // 公开路由标记（login/register/refresh/health 无需 Bearer Token 认证）
      const publicPaths = [
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/refresh",
        "/health"
      ];
      const isPublicRoute = publicPaths.some((p) => url.pathname === p);
      if (isPublicRoute) {
        request._publicRoute = true;
      }

      if (!route) {
        send(response, 404, { error: "not_found", message: "Route not found" }, request);
        return;
      }

      const context = buildRequestContext({ store, req: request });
      const body = await readBody(request);

      // 非公开路由需要认证
      if (!isPublicRoute && !context.authenticated) {
        const statusCode = context.error === "no_token" ? 401 : 401;
        send(response, statusCode, {
          error: context.error || "unauthorized",
          message: context.error === "no_token" ? "Authorization header is missing" : "Authentication required"
        }, request);
        return;
      }

      const result = await route.handler({ store, jobs, body, params: route.params, query: url.searchParams, context, req: request });
      send(response, route.status ?? 200, result, request);
    } catch (error) {
      send(response, error.statusCode ?? 500, {
        error: error.code ?? "internal_error",
        message: error.message
      }, request);
    }
  });
}

function matchRoute(method, pathname) {
  const routes = [
    // ============ 认证路由 ============
    ["POST", /^\/api\/auth\/login$/, handleLogin],
    ["POST", /^\/api\/auth\/register$/, handleRegister, 201],
    ["POST", /^\/api\/auth\/logout$/, handleLogout],
    ["POST", /^\/api\/auth\/refresh$/, handleRefreshToken],
    // PUT /me/password 必须在 PUT /me 之前
    ["PUT", /^\/api\/auth\/me\/password$/, handleChangePassword],
    ["GET", /^\/api\/auth\/me$/, handleGetMe],
    ["PUT", /^\/api\/auth\/me$/, handleUpdateMe],
    ["GET", /^\/api\/auth\/context$/, getAuthContext],
    // ============ 业务路由 ============
    ["GET", /^\/health$/, health],
    ["GET", /^\/api\/schema$/, schema],
    ["GET", /^\/api\/audit-logs$/, listAuditLogs],
    ["GET", /^\/api\/categories$/, listCategories],
    ["GET", /^\/api\/categories\/([^/]+)$/, getCategory],
    ["GET", /^\/api\/brands$/, listBrands],
    ["GET", /^\/api\/brands\/([^/]+)$/, getBrand],
    ["GET", /^\/api\/platforms\/methodologies$/, listPlatformMethods],
    ["GET", /^\/api\/platforms\/methodologies\/([^/]+)$/, getPlatformMethod],
    ["GET", /^\/api\/admin\/storage\/diagnostics$/, getStorageDiagnostics],
    ["GET", /^\/api\/governance\/cost-summary$/, getCostSummary],
    ["GET", /^\/api\/governance\/quality-summary$/, getQualitySummary],
    ["GET", /^\/api\/tasks$/, listTasks],
    ["POST", /^\/api\/tasks$/, createTask, 201],
    ["GET", /^\/api\/tasks\/([^/]+)$/, getTask],
    ["GET", /^\/api\/tasks\/([^/]+)\/comment-signals$/, getTaskCommentSignals],
    ["GET", /^\/api\/tasks\/([^/]+)\/comment-signals\/([^/]+)\/comments$/, listTaskCommentSignalComments],
    ["POST", /^\/api\/tasks\/([^/]+)\/parse-comments$/, parseComments, 201],
    ["POST", /^\/api\/tasks\/([^/]+)\/confirm-mapping$/, confirmMapping],
    ["POST", /^\/api\/tasks\/([^/]+)\/start$/, startTaskPipeline],
    ["GET", /^\/api\/tasks\/([^/]+)\/reports$/, listTaskReports],
    ["POST", /^\/api\/tasks\/([^/]+)\/reports$/, createTaskReport, 201],
    ["GET", /^\/api\/tasks\/([^/]+)\/status$/, getTaskStatus],
    ["GET", /^\/api\/tasks\/([^/]+)\/agent-runs$/, listTaskAiRuns],
    // BL-003/004: 归因分析 API
    ["POST", /^\/api\/tasks\/([^/]+)\/attribution\/run$/, runTaskAttribution, 202],
    ["GET", /^\/api\/tasks\/([^/]+)\/attribution$/, getTaskAttribution],
    // BL-008: 内容生产卡 API
    ["POST", /^\/api\/tasks\/([^/]+)\/production-cards\/generate$/, generateTaskProductionCard, 201],
    ["GET", /^\/api\/tasks\/([^/]+)\/production-cards$/, listTaskProductionCards],
    ["GET", /^\/api\/production-cards\/([^/]+)$/, getProductionCard],
    // BL-009: 质检 API
    ["POST", /^\/api\/production-cards\/([^/]+)\/quality-check$/, runQualityCheckHandler, 201],
    ["POST", /^\/api\/tasks\/([^/]+)\/comment-ops$/, generateCommentOpsHandler, 201],
    ["POST", /^\/api\/production-cards\/([^/]+)\/ad-fit$/, scoreAdFitHandler, 200],
    ["GET", /^\/api\/reports\/templates$/, listReportTemplatesHandler],
    ["POST", /^\/api\/reports\/generate$/, generateWhiteLabelReport, 201],
    ["GET", /^\/api\/reports\/([^/]+)\/download$/, downloadReport],
    ["GET", /^\/api\/reports\/([^/]+)$/, getReport],
    ["GET", /^\/api\/ai\/runs$/, listAiRuns],
    ["POST", /^\/api\/ai\/runs\/([^/]+)\/retry$/, retryAiRun],
    ["GET", /^\/api\/ai\/runs\/([^/]+)\/feedback$/, listAiRunFeedback],
    ["POST", /^\/api\/ai\/runs\/([^/]+)\/feedback$/, createAiRunFeedback, 201],
    ["GET", /^\/api\/ai\/runs\/([^/]+)$/, getAiRun],
    ["POST", /^\/api\/ai\/run-agent$/, runSingleAgent, 201],
    ["GET", /^\/api\/ai\/schemas$/, listAiSchemas],
    ["POST", /^\/api\/ai\/schemas$/, createAiSchema, 201],
    ["GET", /^\/api\/ai\/schemas\/([^/]+)$/, getAiSchema],
    ["POST", /^\/api\/ai\/schemas\/([^/]+)\/status$/, updateAiSchemaStatus],
    ["POST", /^\/api\/ai\/schemas\/([^/]+)\/validate$/, validateAiSchema],
    ["GET", /^\/api\/ai\/prompts$/, listAiPrompts],
    ["GET", /^\/api\/ai\/prompts\/([^/]+)$/, getAiPrompt],
    ["POST", /^\/api\/ai\/prompts\/([^/]+)\/versions$/, createAiPromptVersion, 201],
    ["POST", /^\/api\/ai\/prompts\/([^/]+)\/activate$/, activateAiPromptVersion],
    ["GET", /^\/api\/model-gateway\/routes$/, listModelRoutes],
    ["GET", /^\/api\/model-gateway\/providers$/, listModelProviders],
    ["POST", /^\/api\/model-gateway\/providers\/([^/]+)\/key$/, upsertModelProviderKey],
    ["POST", /^\/api\/model-gateway\/providers\/([^/]+)\/key\/delete$/, removeModelProviderKey],
    ["POST", /^\/api\/model-gateway\/providers\/([^/]+)\/test$/, testModelProvider],
    ["GET", /^\/api\/ai\/skills\/metrics$/, getSkillMetrics],
    ["GET", /^\/api\/ai\/skills\/history\/([^/]+)$/, getSkillIterationHistory]
  ];

  for (const [routeMethod, pattern, handler, status] of routes) {
    const match = pathname.match(pattern);
    if (routeMethod === method && match) {
      return { handler, status, params: match.slice(1) };
    }
  }

  return null;
}

// ============================================================
// Core Handlers
// ============================================================

async function health({ store }) {
  return {
    ok: true,
    service: "vocos-backend",
    version: "0.2.0",
    storeDriver: "sqlite",
    tasks: store.list("tasks").length,
    aiRuns: store.list("aiRuns").length
  };
}

async function listCategories({ store }) {
  const categories = store.list("categoryKnowledge");
  return categories.map(({ platformTactics, needTaxonomy, barrierTaxonomy, audienceSegments, competitorBenchmarks, ...rest }) => rest);
}

async function getCategory({ store, params }) {
  const category = store.get("categoryKnowledge", params[0]);
  if (!category) {
    const error = new Error("Category not found");
    error.statusCode = 404;
    error.code = "not_found";
    throw error;
  }
  return category;
}

async function listBrands({ store }) {
  return store.list("brandProfiles").map(({ products, targetAudience, keyMessages, ...rest }) => rest);
}

async function getBrand({ store, params }) {
  const brand = store.get("brandProfiles", params[0]);
  if (!brand) {
    const error = new Error("Brand not found");
    error.statusCode = 404; error.code = "not_found"; throw error;
  }
  return brand;
}

async function listPlatformMethods({ store }) {
  return store.list("platformMethodologies");
}

async function getPlatformMethod({ store, params }) {
  const methods = store.list("platformMethodologies");
  const result = methods.find(m => m.platform === params[0]);
  if (!result) { const e = new Error("Not found"); e.statusCode = 404; e.code = "not_found"; throw e; }
  return result;
}

// ============================================================
// T-AUTH-10: POST /api/auth/login
// ============================================================

async function handleLogin({ store, body, context, req }) {
  const { email, password } = body ?? {};

  if (!email || !password) {
    throw badRequest("Missing required fields: email, password");
  }

  const normalizedEmail = email.toLowerCase().trim();

  // 限流检查
  const ip = getClientIp(req);
  if (!checkRateLimit("login:" + ip, 5, 60000)) {
    throw authError("too_many_attempts", "请求过于频繁，请稍后再试", 429);
  }

  // 检查登录锁定
  if (loginTracker.isLocked(normalizedEmail)) {
    throw authError("account_locked", "账户已被锁定，请15分钟后再试", 429);
  }

  // 查找用户
  const user = store.list("users")?.find((u) => u.email === normalizedEmail) ?? null;
  if (!user || !verifyPassword(password, user.password_hash)) {
    loginTracker.recordFailure(normalizedEmail);
    throw authError("invalid_credentials", "邮箱或密码错误", 401);
  }

  // 登录成功，清除失败计数
  loginTracker.reset(normalizedEmail);

  // 查询团队成员关系
  const membership = store.list("teamMembers")?.find((m) => m.userId === user.id) ?? null;
  const teamId = membership?.teamId ?? "team_demo";
  const role = membership?.role ?? "viewer";
  const permissions = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.super_admin;
  const team = store.list("teams")?.find((t) => t.id === teamId) ?? null;

  // 签发 Token 对
  const accessToken = signToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role,
    team_id: teamId,
    team_name: team?.teamName ?? team?.name ?? "",
    permissions,
  }, "15m");

  const refreshFamily = crypto.randomUUID();
  const refreshToken = signToken({
    sub: user.id,
    type: "refresh",
    family: refreshFamily,
  }, "7d");

  // 构建 Cookie 字符串
  const isProd = process.env.NODE_ENV === "production";
  const securePart = isProd ? "; Secure" : "";
  const setCookie = `refreshToken=${refreshToken}; HttpOnly${securePart}; SameSite=Strict; Path=/api/auth; Max-Age=604800`;

  return {
    data: {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role ?? role,
      },
      team: team ? { id: team.id, teamName: team.teamName ?? team.name } : null,
      permissions,
    },
    __cookies: [setCookie],
  };
}

// ============================================================
// T-AUTH-11: POST /api/auth/register
// ============================================================

async function handleRegister({ store, body, context, req }) {
  const { name, email, password, teamName, inviteCode } = body ?? {};

  if (!name || !email || !password) {
    throw badRequest("Missing required fields: name, email, password");
  }

  if (password.length < 8) {
    throw badRequest("密码至少需要8位");
  }

  // P2-6: name 长度检查和 email 格式验证
  if (name.length > 50) {
    throw badRequest("昵称不能超过50个字符");
  }
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_REGEX.test(email)) {
    throw badRequest("邮箱格式不正确");
  }

  // 限流检查
  const ip = getClientIp(req);
  if (!checkRateLimit("register:" + ip, 3, 60000)) {
    throw authError("too_many_attempts", "请求过于频繁，请稍后再试", 429);
  }

  const normalizedEmail = email.toLowerCase().trim();

  // 查重
  const existing = store.list("users")?.find((u) => u.email === normalizedEmail);
  if (existing) {
    const err = new Error("该邮箱已注册");
    err.statusCode = 409;
    err.code = "email_exists";
    throw err;
  }

  const userId = createId("user");

  // 团队逻辑
  let teamId;
  let role;

  if (inviteCode) {
    // 邀请码加入已有团队
    const team = store.list("teams")?.find((t) => t.inviteCode === inviteCode);
    if (!team) {
      throw badRequest("邀请码无效");
    }
    teamId = team.id;
    role = "member";
  } else if (teamName) {
    // 创建新团队
    teamId = createId("team");
    await store.insert("teams", {
      id: teamId,
      teamName,
      planType: "internal",
      status: "active",
      createdAt: now(),
    });
    role = "team_admin";
  } else {
    // 默认团队
    teamId = createId("team");
    await store.insert("teams", {
      id: teamId,
      teamName: name + "的团队",
      planType: "internal",
      status: "active",
      createdAt: now(),
    });
    role = "team_admin";
  }

  // 创建用户
  const passwordHash = hashPassword(password);
  await store.insert("users", {
    id: userId,
    name,
    email: normalizedEmail,
    password_hash: passwordHash,
    role,
    status: "active",
    createdAt: now(),
  });

  // 创建团队成员关系
  await store.insert("teamMembers", {
    id: createId("member"),
    userId,
    teamId,
    role,
    createdAt: now(),
  });

  const permissions = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.super_admin;
  const team = store.get("teams", teamId);

  // 签发 Token 对
  const accessToken = signToken({
    sub: userId,
    email: normalizedEmail,
    name,
    role,
    team_id: teamId,
    team_name: team?.teamName ?? team?.name ?? "",
    permissions,
  }, "15m");

  const refreshFamily = crypto.randomUUID();
  const refreshToken = signToken({
    sub: userId,
    type: "refresh",
    family: refreshFamily,
  }, "7d");

  const isProd = process.env.NODE_ENV === "production";
  const securePart = isProd ? "; Secure" : "";
  const setCookie = `refreshToken=${refreshToken}; HttpOnly${securePart}; SameSite=Strict; Path=/api/auth; Max-Age=604800`;

  return {
    data: {
      accessToken,
      user: { id: userId, name, email: normalizedEmail, role },
      team: team ? { id: team.id, teamName: team.teamName ?? team.name } : null,
      permissions,
    },
    __cookies: [setCookie],
  };
}

// ============================================================
// T-AUTH-12: POST /api/auth/logout
// ============================================================

async function handleLogout({ req }) {
  const setCookies = [];

  // 从 Cookie 解析 refreshToken 并加入黑名单
  const cookies = parseCookies(req?.headers?.cookie);
  const refreshToken = cookies.refreshToken;
  if (refreshToken) {
    try {
      const { jti } = verifyToken(refreshToken);
      if (jti) {
        // 默认 7 天后过期
        refreshBlacklist.add(jti, Date.now() + 7 * 24 * 3600 * 1000);
      }
    } catch {
      // Token 可能已无效，忽略
    }
  }

  // Clear Cookie
  const isProd = process.env.NODE_ENV === "production";
  const securePart = isProd ? "; Secure" : "";
  setCookies.push(`refreshToken=; HttpOnly${securePart}; SameSite=Strict; Path=/api/auth; Max-Age=0`);

  return {
    data: { ok: true },
    __cookies: setCookies,
  };
}

// ============================================================
// T-AUTH-13: POST /api/auth/refresh
// ============================================================

async function handleRefreshToken({ store, req }) {
  const cookies = parseCookies(req?.headers?.cookie);
  const refreshToken = cookies.refreshToken;

  if (!refreshToken) {
    throw authError("unauthorized", "No refresh token provided");
  }

  let payload;
  let jti;
  try {
    const result = verifyToken(refreshToken);
    payload = result.payload;
    jti = result.jti;
  } catch (err) {
    throw authError("unauthorized", err.code === "token_expired" ? "Refresh token has expired" : "Invalid refresh token");
  }

  if (payload.type !== "refresh") {
    throw authError("unauthorized", "Invalid token type");
  }

  // 检查是否在黑名单中（重用检测）
  if (refreshBlacklist.isBlacklisted(jti)) {
    throw authError("token_reused", "Refresh token reuse detected", 403);
  }

  // 将旧 token 加入黑名单
  const expiresAt = payload.exp ? payload.exp * 1000 : Date.now() + 7 * 24 * 3600 * 1000;
  refreshBlacklist.add(jti, expiresAt);

  // 查询最新用户数据
  const user = store.get("users", payload.sub);
  if (!user || user.status !== "active") {
    throw authError("unauthorized", "User is not active");
  }

  const membership = store.list("teamMembers")?.find((m) => m.userId === user.id) ?? null;
  const teamId = membership?.teamId ?? "team_demo";
  const role = membership?.role ?? user.role ?? "viewer";
  const permissions = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.super_admin;
  const team = store.get("teams", teamId);

  // 签发新 Token 对（同 family，新 jti）
  const newAccessToken = signToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role,
    team_id: teamId,
    team_name: team?.teamName ?? team?.name ?? "",
    permissions,
  }, "15m");

  const newRefreshToken = signToken({
    sub: user.id,
    type: "refresh",
    family: payload.family || crypto.randomUUID(),
  }, "7d");

  const isProd = process.env.NODE_ENV === "production";
  const securePart = isProd ? "; Secure" : "";
  const setCookie = `refreshToken=${newRefreshToken}; HttpOnly${securePart}; SameSite=Strict; Path=/api/auth; Max-Age=604800`;

  return {
    data: {
      accessToken: newAccessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role ?? role,
      },
      team: team ? { id: team.id, teamName: team.teamName ?? team.name } : null,
      permissions,
    },
    __cookies: [setCookie],
  };
}

// ============================================================
// T-AUTH-14: GET /api/auth/me
// ============================================================

// P3-4: 公共函数，避免 handleGetMe 和 getAuthContext 重复代码
function buildAuthMeResponse(context) {
  const user = context.user;
  const team = context.team;

  return {
    data: {
      user: user ? {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role ?? context.role,
        phone: user.phone ?? null,
        avatarUrl: user.avatarUrl ?? null,
        status: user.status,
        createdAt: user.createdAt,
      } : null,
      team: team ? {
        id: team.id,
        teamName: team.teamName ?? team.name,
        planType: team.planType,
      } : null,
      permissions: context.permissions,
    },
  };
}

async function handleGetMe({ context }) {
  return buildAuthMeResponse(context);
}

// ============================================================
// T-AUTH-15: PUT /api/auth/me
// ============================================================

async function handleUpdateMe({ store, body, context }) {
  const { name, phone, avatarUrl } = body ?? {};

  if (!name && phone === undefined && avatarUrl === undefined) {
    throw badRequest("At least one field to update is required: name, phone, avatarUrl");
  }

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
  updates.updatedAt = now();

  const updated = await store.update("users", context.userId, updates);

  return {
    data: {
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role ?? context.role,
        phone: updated.phone ?? null,
        avatarUrl: updated.avatarUrl ?? null,
        status: updated.status,
      },
    },
  };
}

// ============================================================
// T-AUTH-16: PUT /api/auth/me/password
// ============================================================

async function handleChangePassword({ store, body, context, req }) {
  // P1-6: 权限检查
  requirePermission(context, PERMISSIONS.USER_MANAGE);

  const { oldPassword, newPassword } = body ?? {};

  if (!oldPassword || !newPassword) {
    throw badRequest("Missing required fields: oldPassword, newPassword");
  }

  if (newPassword.length < 8) {
    throw badRequest("密码至少需要8位");
  }

  // P2-5: 修改密码限流保护
  const ip = getClientIp(req);
  if (!checkRateLimit("change-password:" + ip, 5, 60000)) {
    throw authError("too_many_attempts", "请求过于频繁，请稍后再试", 429);
  }

  const user = context.user;
  if (!user || !verifyPassword(oldPassword, user.password_hash)) {
    // P1-1: 验证失败应 throw 错误，而非 return 导致 HTTP 200
    throw badRequest("旧密码不正确");
  }

  const passwordHash = hashPassword(newPassword);
  await store.update("users", context.userId, {
    password_hash: passwordHash,
    updatedAt: now(),
  });

  return {
    data: { ok: true },
  };
}

// ============================================================
// Core Handlers (continued)
// ============================================================

async function getAuthContext({ context }) {
  return buildAuthMeResponse(context);
}

async function schema({ store, context }) {
  return {
    statuses: [
      "draft",
      "uploaded",
      "mapping_required",
      "ready",
      "analyzing",
      "partially_failed",
      "failed",
      "completed",
      "exported",
      "archived"
    ],
    agents: store.list("agents"),
    collections: [
      "tasks",
      "commentFiles",
      "comments",
      "aiRuns",
      "reports",
      "aiQualityFeedback",
      "auditLogs",
      "teamMembers",
      "modelProviders",
      "modelConfigs"
    ]
  };
}

async function listAuditLogs({ store, context, query }) {
  requirePermission(context, PERMISSIONS.AUDIT_READ);
  const limit = clampNumber(Number(query.get("limit") ?? 50), 1, 200);
  const logs = filterByTeam(context, store.list("auditLogs"))
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  return {
    data: logs.slice(0, limit),
    meta: {
      total: logs.length,
      limit
    }
  };
}

async function getStorageDiagnostics({ store, context }) {
  requirePermission(context, PERMISSIONS.AUDIT_READ);
  const diagnostics = store.storageDiagnostics
    ? store.storageDiagnostics()
    : buildFallbackStorageDiagnostics(store);
  return {
    data: diagnostics
  };
}

async function getCostSummary({ store, query, context }) {
  requirePermission(context, PERMISSIONS.COST_READ);
  const teamId = query.get("teamId") ?? context.teamId ?? "team_demo";
  assertTeamAccess(context, teamId);
  return {
    data: buildCostSummary({
      store,
      teamId,
      projectId: query.get("projectId"),
      taskId: query.get("taskId"),
      period: query.get("period") ?? "current_month"
    })
  };
}

async function getQualitySummary({ store, query, context }) {
  requirePermission(context, PERMISSIONS.QUALITY_READ);
  const teamId = query.get("teamId") ?? context.teamId ?? "team_demo";
  assertTeamAccess(context, teamId);
  return {
    data: buildQualitySummary({
      store,
      teamId,
      projectId: query.get("projectId"),
      taskId: query.get("taskId"),
      period: query.get("period") ?? "current_month"
    })
  };
}

// ============================================================
// Task Handlers
// ============================================================

async function listTasks({ store, context }) {
  requirePermission(context, PERMISSIONS.TASK_READ);
  if (store.listTasks) {
    return {
      data: store.listTasks({
        teamId: context.teamId,
        includeAllTeams: context.role === "super_admin"
      })
    };
  }
  return { data: filterByTeam(context, store.list("tasks")) };
}

async function createTask({ store, body, context }) {
  requirePermission(context, PERMISSIONS.TASK_WRITE);
  requireFields(body, ["taskName", "platform", "contentTitle"]);
  const teamId = body.teamId ?? context.teamId ?? "team_demo";
  assertTeamAccess(context, teamId);

  const task = {
    id: createId("task"),
    teamId,
    projectId: body.projectId ?? "project_demo",
    taskName: body.taskName,
    platform: body.platform,
    contentUrl: body.contentUrl ?? "",
    contentTitle: body.contentTitle,
    contentBody: body.contentBody ?? "",
    contentGoal: body.contentGoal ?? "unknown",
    brandInfo: body.brandInfo ?? "",
    productInfo: body.productInfo ?? "",
    competitorInfo: body.competitorInfo ?? "",
    status: "draft",
    createdBy: body.createdBy ?? context.userId ?? "user_demo",
    createdAt: now(),
    updatedAt: now(),
    startedAt: null,
    completedAt: null
  };

  const created = await store.insert("tasks", task);
  await writeAuditLog({ store, context, action: "task.created", resourceType: "task", resourceId: created.id });
  return { data: created };
}

async function getTask({ store, params, context }) {
  requirePermission(context, PERMISSIONS.TASK_READ);
  const task = mustGet(store, "tasks", params[0]);
  assertTeamAccess(context, task.teamId);
  const associations = store.getTaskAssociations
    ? store.getTaskAssociations(task.id)
    : {
      commentFiles: store.list("commentFiles").filter((file) => file.taskId === task.id),
      commentsCount: store.list("comments").filter((comment) => comment.taskId === task.id).length,
      aiRunsCount: store.list("aiRuns").filter((run) => run.taskId === task.id).length,
      reportsCount: store.list("reports").filter((report) => report.taskId === task.id).length
    };
  return {
    data: {
      ...task,
      ...associations
    }
  };
}

async function getTaskCommentSignals({ store, params, context }) {
  requirePermission(context, PERMISSIONS.TASK_READ);
  const task = mustGet(store, "tasks", params[0]);
  assertTeamAccess(context, task.teamId);
  const comments = store.list("comments").filter((comment) => comment.taskId === task.id);
  const insights = buildCommentInsights({ comments });

  return {
    data: {
      taskId: task.id,
      taskName: task.taskName,
      platform: task.platform,
      source: "comment-insights-rule-v0.2.0",
      ...insights
    }
  };
}

async function listTaskCommentSignalComments({ store, params, query, context }) {
  requirePermission(context, PERMISSIONS.TASK_READ);
  const task = mustGet(store, "tasks", params[0]);
  assertTeamAccess(context, task.teamId);

  const limit = Math.min(Math.max(Number(query.get("limit") ?? 100), 1), 300);
  const offset = Math.max(Number(query.get("offset") ?? 0), 0);
  const comments = store.list("comments").filter((comment) => comment.taskId === task.id);
  const matches = listCommentSignalMatches({
    comments,
    signalKey: decodeURIComponent(params[1]),
    limit,
    offset
  });

  if (!matches.signal) {
    throw badRequest(`Unknown comment signal: ${params[1]}`);
  }

  const format = query.get("format");
  if (format === "csv" || format === "xlsx") {
    const rows = signalCommentExportRows({ matches, task });
    const fileBaseName = safeFileName(`${task.taskName || task.id}_${matches.signal.label}_comments`);
    if (format === "xlsx") {
      return {
        __raw: true,
        content: buildWorkbookXlsx({
          sheets: [
            { name: "总览", rows: signalExportOverviewRows({ matches, task, comments }) },
            { name: "当前标签评论", rows },
            { name: "Reply Suggestions", rows: signalReplySuggestionRows(matches.signal, { task, store, evidence: matches.comments }) }
          ]
        }),
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": contentDispositionAttachment(`${fileBaseName}.xlsx`)
        }
      };
    }

    return {
      __raw: true,
      content: toCsv(rows),
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": contentDispositionAttachment(`${fileBaseName}.csv`)
      }
    };
  }

  return {
    data: {
      taskId: task.id,
      taskName: task.taskName,
      ...matches
    }
  };
}

function signalCommentExportRows({ matches, task }) {
  return [
    ["task_id", "task_name", "signal_key", "signal_label", "comment_id", "like_count", "comment_text"],
    ...matches.comments.map((comment) => [
      task.id,
      task.taskName || "",
      matches.signal.key,
      matches.signal.label,
      comment.comment_id,
      comment.like_count ?? 0,
      comment.comment_text
    ])
  ];
}

function signalExportOverviewRows({ matches, task, comments }) {
  return [
    ["field", "value"],
    ["task_id", task.id],
    ["task_name", task.taskName || ""],
    ["platform", task.platform || ""],
    ["signal_key", matches.signal.key],
    ["signal_label", matches.signal.label],
    ["signal_description", matches.signal.description],
    ["total_comments", comments.length],
    ["matched_comments", matches.total],
    ["exported_comments", matches.comments.length],
    ["exported_at", new Date().toISOString()]
  ];
}

function signalReplySuggestionRows(signal, { task, store, evidence = [] } = {}) {
  const commentOps = latestCommentOperationOutput({ task, store });
  const matchedSuggestion = (commentOps.label_reply_suggestions ?? []).find((item) =>
    item.signal_key === signal.key ||
    item.signal_label === signal.label ||
    String(item.signal_label ?? "").includes(signal.label)
  );
  const matchedPlay = (commentOps.reply_playbook ?? []).find((item) =>
    item.signal_key === signal.key ||
    item.signal_label === signal.label ||
    item.signal === signal.label ||
    item.signal === signal.key ||
    String(item.signal ?? "").includes(signal.label)
  );
  const sampleComment = evidence.find((item) => item.comment_text)?.comment_text ?? "";
  const replyGoal = matchedSuggestion?.reply_goal ?? matchedPlay?.reply_goal ?? "先确认用户问题，再给证据、边界和下一步动作。";
  const suggestedReply = matchedSuggestion?.suggested_reply
    ?? matchedPlay?.suggested_reply
    ?? buildAgentBackedReply({ signal, replyGoal, sampleComment, pinnedReply: commentOps.pinned_reply });

  return [
    ["signal_key", "signal_label", "source_agent", "priority", "tone", "reply_goal", "sample_comment", "suggested_reply", "pinned_reply", "dm_trigger", "risk_controls"],
    [
      signal.key,
      signal.label,
      commentOps.agentName ?? "comment_operation_agent",
      matchedSuggestion?.priority ?? "",
      matchedSuggestion?.tone ?? "",
      replyGoal,
      matchedSuggestion?.sample_comment ?? sampleComment,
      suggestedReply,
      commentOps.pinned_reply ?? "",
      matchedSuggestion?.dm_trigger ?? (commentOps.dm_triggers ?? []).join(" / "),
      (commentOps.risk_controls ?? []).join(" / ")
    ]
  ];
}

function latestCommentOperationOutput({ task, store }) {
  const run = store?.list?.("aiRuns")
    ?.filter((candidate) =>
      candidate.taskId === task?.id &&
      candidate.agentName === "comment_operation_agent" &&
      candidate.status === "success"
    )
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))[0];
  return {
    agentName: run?.agentName,
    ...(run?.outputJson?.result?.comment_ops ?? {})
  };
}

function buildAgentBackedReply({ signal, replyGoal, sampleComment, pinnedReply }) {
  if (sampleComment) {
    return `围绕「${sampleComment}」回复：${replyGoal} 可补充置顶说明：${pinnedReply ?? "暂无置顶话术"}`;
  }
  return `${signal.label}类评论回复方向：${replyGoal}`;
}

function toCsv(rows) {
  const BOM = "\uFEFF";
  return BOM + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function parseComments({ store, params, body, context }) {
  requirePermission(context, PERMISSIONS.TASK_WRITE);
  const task = mustGet(store, "tasks", params[0]);
  assertTeamAccess(context, task.teamId);

  // P1-4: 互斥锁防止并发 parse 互相覆盖
  if (parsingTaskIds.has(task.id)) {
    throw badRequest(`Task ${task.id} is already being parsed, please wait`);
  }
  parsingTaskIds.add(task.id);
  try {
  const upload = normalizeCommentUpload(body, task);
  const parsed = upload.fileBuffer
    ? await parseCommentFileBuffer({
      fileName: upload.fileName,
      fileBuffer: upload.fileBuffer,
      platform: upload.platform,
      mapping: upload.mapping
    })
    : parseCommentFileContent({
      fileName: upload.fileName,
      fileContent: upload.fileContent,
      platform: upload.platform,
      mapping: upload.mapping
    });

  if (task.status === "analyzing" || task.status === "archived") {
    throw badRequest(`Task cannot accept file upload from status: ${task.status}`);
  }

  const nextStatus = nextStatusForParsedFile({ needsMapping: parsed.needsMapping });
  // P1-3: 直接跳到 nextStatus，不先写 "uploaded"
  await store.update("tasks", task.id, { status: nextStatus });

  const file = {
    ...parsed.file,
    taskId: task.id,
    storageUrl: `local://${parsed.file.id}/${parsed.file.fileName}`,
    rawContent: upload.fileContent ?? null,
    rawFileBase64: upload.fileBuffer ? upload.fileBuffer.toString("base64") : null
  };
  await store.insert("commentFiles", file);

  if (!parsed.needsMapping) {
    const existingComments = store.list("comments").filter((comment) => comment.taskId !== task.id);
    const comments = parsed.comments.map((comment) => ({
      ...comment,
      taskId: task.id,
      commentFileId: file.id
    }));
    await store.replaceAll("comments", [...existingComments, ...comments]);
  }

  await writeAuditLog({ store, context, action: "task.comments_parsed", resourceType: "task", resourceId: task.id, metadata: { fileName: file.fileName, rowCount: file.rowCount } });
  return {
    data: {
      file,
      mapping: parsed.mapping,
      stats: parsed.stats,
      preview: parsed.preview,
      task: store.get("tasks", task.id)
    }
  };
  } finally {
    // P1-4: 释放互斥锁
    parsingTaskIds.delete(task.id);
  }
}

async function confirmMapping({ store, params, body, context }) {
  requirePermission(context, PERMISSIONS.TASK_WRITE);
  const task = mustGet(store, "tasks", params[0]);
  assertTeamAccess(context, task.teamId);
  if (task.status !== "mapping_required" && task.status !== "uploaded") {
    throw badRequest(`Task is not waiting for mapping: ${task.status}`);
  }

  const file = store.list("commentFiles").find((candidate) => candidate.taskId === task.id);
  if (!file) throw badRequest("No parsed comment file found for this task");
  if (!file.rawContent && !file.rawFileBase64) {
    throw badRequest("Original file content is missing; upload the file again");
  }

  const mapping = body.mapping ?? file.mappingConfig;
  const parsed = file.rawFileBase64
    ? await parseCommentFileBuffer({
      fileName: file.fileName,
      fileBuffer: Buffer.from(file.rawFileBase64, "base64"),
      platform: task.platform,
      mapping
    })
    : parseCommentFileContent({
      fileName: file.fileName,
      fileContent: file.rawContent,
      platform: task.platform,
      mapping
    });

  const existingComments = store.list("comments").filter((comment) => comment.commentFileId !== file.id);
  const comments = parsed.comments.map((comment) => ({
    ...comment,
    taskId: task.id,
    commentFileId: file.id
  }));
  await store.replaceAll("comments", [...existingComments, ...comments]);

  await store.update("commentFiles", file.id, {
    mappingConfig: mapping,
    parseStatus: "parsed",
    rowCount: parsed.stats.totalRows
  });
  assertTransition(task.status, "ready");
  const updatedTask = await store.update("tasks", task.id, { status: "ready" });
  await writeAuditLog({ store, context, action: "task.mapping_confirmed", resourceType: "task", resourceId: task.id });
  return {
    data: {
      task: updatedTask,
      file: store.get("commentFiles", file.id),
      stats: parsed.stats,
      preview: parsed.preview
    }
  };
}

async function startTaskPipeline({ store, jobs, params, context }) {
  requirePermission(context, PERMISSIONS.TASK_WRITE);
  const task = mustGet(store, "tasks", params[0]);
  assertTeamAccess(context, task.teamId);
  if (task.status === "analyzing") {
    return {
      data: buildTaskStatusPayload({ store, jobs, taskId: task.id, queued: true })
    };
  }

  if (task.status !== "ready" && task.status !== "completed" && task.status !== "failed" && task.status !== "partially_failed") {
    throw badRequest(`Task cannot start from status: ${task.status}`);
  }

  assertTransition(task.status, "analyzing");
  // P1-7: 逐个删除当前任务旧 aiRuns，避免 replaceAll 竞态覆盖其他任务
  const oldRuns = store.list("aiRuns").filter((run) => run.taskId === task.id);
  for (const run of oldRuns) {
    await store.delete("aiRuns", run.id);
  }
  const updatedTask = await store.update("tasks", task.id, {
    status: "analyzing",
    startedAt: now(),
    completedAt: null
  });

  const job = {
    taskId: task.id,
    status: "running",
    startedAt: now(),
    completedAgents: 0,
    totalAgents: store.list("agents").length,
    error: null
  };
  await savePipelineJob({ store, jobs, job });

  runPipelineJob({ store, jobs, taskId: task.id });

  await writeAuditLog({ store, context, action: "task.pipeline_started", resourceType: "task", resourceId: updatedTask.id });
  return {
    data: buildTaskStatusPayload({ store, jobs, taskId: updatedTask.id, queued: true })
  };
}

async function listTaskAiRuns({ store, params, context }) {
  requirePermission(context, PERMISSIONS.AI_RUN_READ);
  const task = mustGet(store, "tasks", params[0]);
  assertTeamAccess(context, task.teamId);
  return {
    data: store.list("aiRuns").filter((run) => run.taskId === params[0])
  };
}

async function listTaskReports({ store, params, context }) {
  requirePermission(context, PERMISSIONS.REPORT_READ);
  const task = mustGet(store, "tasks", params[0]);
  assertTeamAccess(context, task.teamId);
  const reports = store.list("reports")
    .filter((report) => report.taskId === params[0])
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  return { data: reports.map(summarizeReport) };
}

async function createTaskReport({ store, params, body, context }) {
  requirePermission(context, PERMISSIONS.REPORT_WRITE);
  const task = mustGet(store, "tasks", params[0]);
  assertTeamAccess(context, task.teamId);
  const report = await generateTaskReport({
    store,
    taskId: params[0],
    createdBy: body.createdBy ?? context.userId ?? "user_demo"
  });
  await writeAuditLog({ store, context, action: "report.generated", resourceType: "report", resourceId: report.id, metadata: { taskId: task.id } });
  return { data: detailReport(report) };
}

async function getReport({ store, params, context }) {
  requirePermission(context, PERMISSIONS.REPORT_READ);
  const report = mustGet(store, "reports", params[0]);
  assertTeamAccess(context, report.teamId);
  return { data: detailReport(report) };
}

async function downloadReport({ store, params, query, context }) {
  requirePermission(context, PERMISSIONS.REPORT_READ);
  const report = mustGet(store, "reports", params[0]);
  assertTeamAccess(context, report.teamId);
  const compareReportId = query.get("compareReportId");
  const compareReport = compareReportId ? store.get("reports", compareReportId) : null;
  const exported = exportReport(report, query.get("format") ?? "markdown", { store, compareReport });
  return {
    __raw: true,
    content: exported.content,
    headers: {
      "content-type": exported.contentType,
      "content-disposition": contentDispositionAttachment(exported.fileName)
    }
  };
}

async function getTaskStatus({ store, jobs, params, context }) {
  requirePermission(context, PERMISSIONS.TASK_READ);
  const task = mustGet(store, "tasks", params[0]);
  assertTeamAccess(context, task.teamId);
  return {
    data: buildTaskStatusPayload({ store, jobs, taskId: params[0] })
  };
}

// ============================================================
// AI Run Handlers
// ============================================================

async function listAiRuns({ store, query, context }) {
  requirePermission(context, PERMISSIONS.AI_RUN_READ);
  const limit = clampNumber(Number(query.get("limit") ?? 50), 1, 200);
  const filters = {
    taskId: query.get("taskId"),
    status: query.get("status"),
    providerName: query.get("providerName"),
    executionMode: query.get("executionMode")
  };

  if (store.listAiRuns) {
    const result = store.listAiRuns({
      teamId: context.teamId,
      includeAllTeams: context.role === "super_admin",
      filters,
      limit
    });
    return {
      data: result.records.map(summarizeAiRun),
      meta: {
        total: result.total,
        limit,
        filters,
        source: "sqlite"
      }
    };
  }

  const runs = filterByTeam(context, store.list("aiRuns"))
    .filter((run) => !filters.taskId || run.taskId === filters.taskId)
    .filter((run) => !filters.status || run.status === filters.status)
    .filter((run) => !filters.providerName || run.providerName === filters.providerName)
    .filter((run) => !filters.executionMode || run.executionMode === filters.executionMode)
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));

  return {
    data: runs.slice(0, limit).map(summarizeAiRun),
    meta: {
      total: runs.length,
      limit,
      filters,
      source: "store"
    }
  };
}

async function getAiRun({ store, params, context }) {
  requirePermission(context, PERMISSIONS.AI_RUN_READ);
  const run = mustGet(store, "aiRuns", params[0]);
  assertTeamAccess(context, run.teamId);
  return { data: detailAiRun(run, store) };
}

async function retryAiRun({ store, params, body, context }) {
  requirePermission(context, PERMISSIONS.AI_RUN_WRITE);
  const original = mustGet(store, "aiRuns", params[0]);
  assertTeamAccess(context, original.teamId);
  const task = mustGet(store, "tasks", original.taskId);
  const retry = await runAgent({
    store,
    taskId: task.id,
    agentName: original.agentName,
    input: {
      ...buildAgentInputFromTask(task),
      retry_of_run_id: original.id,
      created_by: body.createdBy ?? context.userId ?? "user_demo"
    },
    promptVersion: body.promptVersion ?? original.promptVersion ?? "latest",
    modelPreference: body.modelPreference ?? original.modelName ?? "auto",
    retryOfRunId: original.id
  });

  await writeAuditLog({ store, context, action: "ai_run.retried", resourceType: "ai_run", resourceId: retry.id, metadata: { retryOfRunId: original.id } });
  return {
    data: {
      original: summarizeAiRun(original),
      retry: detailAiRun(retry, store)
    }
  };
}

async function listAiRunFeedback({ store, params, context }) {
  requirePermission(context, PERMISSIONS.AI_RUN_READ);
  const run = mustGet(store, "aiRuns", params[0]);
  assertTeamAccess(context, run.teamId);
  return {
    data: listFeedbackForRun(store, run.id)
  };
}

async function createAiRunFeedback({ store, params, body, context }) {
  requirePermission(context, PERMISSIONS.AI_RUN_WRITE);
  const run = mustGet(store, "aiRuns", params[0]);
  assertTeamAccess(context, run.teamId);
  const actionString = normalizeFeedbackAction(body.action);
  const feedback = {
    id: createId("feedback"),
    teamId: run.teamId,
    projectId: run.projectId,
    taskId: run.taskId,
    aiRunId: run.id,
    agentName: run.agentName,
    outputType: body.outputType ?? run.agentName,
    action: actionString,
    editDistanceRatio: body.editDistanceRatio === undefined ? null : clampNumber(Number(body.editDistanceRatio), 0, 1),
    rating: body.rating === undefined ? null : clampNumber(Number(body.rating), 1, 5),
    comment: body.comment ?? "",
    createdBy: body.createdBy ?? context.userId ?? "user_demo",
    createdAt: now()
  };
  await store.insert("aiQualityFeedback", feedback);
  await writeAuditLog({ store, context, action: "ai_run.feedback_recorded", resourceType: "ai_run", resourceId: run.id, metadata: { action: actionString } });
  return {
    data: {
      feedback,
      run: detailAiRun(store.get("aiRuns", run.id), store)
    }
  };
}

async function runSingleAgent({ store, body, context }) {
  requirePermission(context, PERMISSIONS.AI_RUN_WRITE);
  requireFields(body, ["task_id", "agent_name"]);
  const task = mustGet(store, "tasks", body.task_id);
  assertTeamAccess(context, task.teamId);
  const run = await runAgent({
    store,
    taskId: body.task_id,
    agentName: body.agent_name,
    input: {
      ...(body.input ?? {}),
      team_id: task.teamId,
      project_id: task.projectId,
      created_by: context.userId ?? "user_demo"
    },
    promptVersion: body.prompt_version ?? "latest",
    modelPreference: body.model_preference ?? "auto"
  });
  await writeAuditLog({ store, context, action: "ai_run.agent_started", resourceType: "ai_run", resourceId: run.id, metadata: { taskId: task.id, agentName: body.agent_name } });
  return { data: run };
}

// ============================================================
// AI Schema Handlers
// ============================================================

async function listAiSchemas({ store, context }) {
  requirePermission(context, PERMISSIONS.SCHEMA_READ);
  return { data: store.list("aiSchemas").map(summarizeSchema) };
}

async function getAiSchema({ store, params, context }) {
  requirePermission(context, PERMISSIONS.SCHEMA_READ);
  const schemaRecord = mustGet(store, "aiSchemas", params[0]);
  return { data: detailSchema(schemaRecord) };
}

async function createAiSchema({ store, body, context }) {
  requirePermission(context, PERMISSIONS.SCHEMA_WRITE);
  requireFields(body, ["id", "name", "version", "schema"]);
  if (store.get("aiSchemas", body.id)) {
    throw badRequest(`Schema already exists: ${body.id}`);
  }

  const schemaRecord = {
    id: body.id,
    name: body.name,
    version: body.version,
    status: body.status ?? "draft",
    schema: body.schema,
    createdBy: body.createdBy ?? context.userId ?? "user_demo",
    createdAt: now(),
    updatedAt: now()
  };
  const created = await store.insert("aiSchemas", schemaRecord);
  await writeAuditLog({ store, context, action: "schema.created", resourceType: "ai_schema", resourceId: created.id });
  return { data: detailSchema(created) };
}

async function updateAiSchemaStatus({ store, params, body, context }) {
  requirePermission(context, PERMISSIONS.SCHEMA_WRITE);
  const schemaRecord = mustGet(store, "aiSchemas", params[0]);
  const status = normalizeSchemaStatus(body.status);
  const updated = await store.update("aiSchemas", schemaRecord.id, {
    status,
    statusUpdatedBy: body.updatedBy ?? context.userId ?? "user_demo",
    statusUpdatedAt: now()
  });
  await writeAuditLog({ store, context, action: "schema.status_updated", resourceType: "ai_schema", resourceId: updated.id, metadata: { status } });
  return { data: detailSchema(updated) };
}

async function validateAiSchema({ store, params, body, context }) {
  requirePermission(context, PERMISSIONS.SCHEMA_READ);
  const schemaRecord = mustGet(store, "aiSchemas", params[0]);
  const sample = body.sample ?? body.value ?? {};
  const validation = validateJsonSchema(sample, schemaRecord.schema);
  return {
    data: {
      schema: summarizeSchema(schemaRecord),
      validation,
      checkedAt: now()
    }
  };
}

// ============================================================
// AI Prompt Handlers
// ============================================================

async function listAiPrompts({ store, context }) {
  requirePermission(context, PERMISSIONS.PROMPT_READ);
  return { data: store.list("aiPrompts").map(summarizePrompt) };
}

async function getAiPrompt({ store, params, context }) {
  requirePermission(context, PERMISSIONS.PROMPT_READ);
  const prompt = mustGet(store, "aiPrompts", params[0]);
  return { data: detailPrompt(prompt) };
}

async function createAiPromptVersion({ store, params, body, context }) {
  requirePermission(context, PERMISSIONS.PROMPT_WRITE);
  const prompt = mustGet(store, "aiPrompts", params[0]);
  requireFields(body, ["version", "systemPrompt", "userPromptTemplate"]);
  if (prompt.versions?.some((item) => item.version === body.version)) {
    throw badRequest(`Prompt version already exists: ${body.version}`);
  }

  const version = {
    id: `${prompt.id}_${slugify(body.version)}`,
    version: body.version,
    outputSchemaId: body.outputSchemaId ?? prompt.versions?.[0]?.outputSchemaId ?? "agent_standard_output_v1",
    defaultModel: body.defaultModel ?? "auto-route",
    systemPrompt: body.systemPrompt,
    userPromptTemplate: body.userPromptTemplate,
    changeLog: body.changeLog ?? "",
    createdBy: body.createdBy ?? context.userId ?? "user_demo",
    createdAt: now()
  };
  const updated = await store.update("aiPrompts", prompt.id, {
    versions: [...(prompt.versions ?? []), version],
    currentVersion: body.activate === false ? prompt.currentVersion : version.version
  });
  await writeAuditLog({ store, context, action: "prompt.version_created", resourceType: "ai_prompt", resourceId: prompt.id, metadata: { version: version.version, activated: body.activate !== false } });
  return { data: detailPrompt(updated) };
}

async function activateAiPromptVersion({ store, params, body, context }) {
  requirePermission(context, PERMISSIONS.PROMPT_WRITE);
  const prompt = mustGet(store, "aiPrompts", params[0]);
  requireFields(body, ["version"]);
  if (!prompt.versions?.some((item) => item.version === body.version)) {
    throw badRequest(`Prompt version not found: ${body.version}`);
  }
  const updated = await store.update("aiPrompts", prompt.id, {
    currentVersion: body.version,
    activatedBy: body.activatedBy ?? context.userId ?? "user_demo",
    activatedAt: now()
  });
  await writeAuditLog({ store, context, action: "prompt.version_activated", resourceType: "ai_prompt", resourceId: prompt.id, metadata: { version: body.version } });
  return { data: detailPrompt(updated) };
}

// ============================================================
// Model Gateway Handlers
// ============================================================

async function listModelRoutes({ store, context }) {
  requirePermission(context, PERMISSIONS.MODEL_READ);
  return { data: getModelRoutes(store) };
}

async function listModelProviders({ store, context }) {
  requirePermission(context, PERMISSIONS.MODEL_READ);
  return { data: getModelProviderStatuses(store) };
}

async function upsertModelProviderKey({ store, params, body, context }) {
  requirePermission(context, PERMISSIONS.MODEL_WRITE);
  requireFields(body, ["apiKey"]);
  const providerName = normalizeProviderName(params[0]);
  const provider = await saveProviderKey({
    store,
    providerName,
    apiKey: body.apiKey,
    actor: body.updatedBy ?? context.userId ?? "user_demo"
  });
  await writeAuditLog({ store, context, action: "model_provider.key_saved", resourceType: "model_provider", resourceId: provider.id, metadata: { providerName } });
  return {
    data: {
      provider,
      gateway: getModelProviderStatuses(store)
    }
  };
}

async function removeModelProviderKey({ store, params, context }) {
  requirePermission(context, PERMISSIONS.MODEL_WRITE);
  const providerName = normalizeProviderName(params[0]);
  const provider = await deleteProviderKey({ store, providerName });
  await writeAuditLog({ store, context, action: "model_provider.key_deleted", resourceType: "model_provider", resourceId: provider.id, metadata: { providerName } });
  return {
    data: {
      provider,
      gateway: getModelProviderStatuses(store)
    }
  };
}

async function testModelProvider({ store, params, body, context }) {
  requirePermission(context, PERMISSIONS.MODEL_READ);
  const providerName = normalizeProviderName(params[0]);
  const result = await testProviderConnection({
    providerName,
    modelName: body.modelName,
    providerRuntime: getStoredProviderSecrets(store),
    timeoutMs: Number(body.timeoutMs ?? 20000)
  });

  return {
    data: {
      test: result,
      gateway: getModelProviderStatuses(store)
    }
  };
}

// ============================================================
// Utility Functions
// ============================================================

async function readBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBuffer = Buffer.concat(chunks);
  const contentType = request.headers["content-type"] ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = parseMultipartFormData(rawBuffer, contentType);
    return { __multipart: true, ...form.fields, __files: form.files };
  }

  const raw = rawBuffer.toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
}

function normalizeCommentUpload(body, task) {
  if (body.__multipart) {
    const file = body.__files?.file ?? body.__files?.commentFile;
    if (!file) throw badRequest("Multipart upload must include a file field named file");

    return {
      fileName: body.fileName || file.fileName,
      fileBuffer: file.buffer,
      fileContent: null,
      platform: body.platform ?? task.platform,
      mapping: parseOptionalJson(body.mapping)
    };
  }

  requireFields(body, ["fileName", "fileContent"]);
  return {
    fileName: body.fileName,
    fileContent: body.fileContent,
    fileBuffer: null,
    platform: body.platform ?? task.platform,
    mapping: body.mapping ?? null
  };
}

function parseOptionalJson(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw badRequest("mapping field must be valid JSON");
  }
}

function send(response, status, payload, request) {
  const origin = request?.headers?.origin ?? "";
  const allowOrigin = getAllowOrigin(origin);

  const baseHeaders = {
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };

  if (allowOrigin) {
    baseHeaders["access-control-allow-origin"] = allowOrigin;
    baseHeaders["access-control-allow-credentials"] = "true";
  }

  // Set-Cookie 支持
  if (payload?.__cookies) {
    baseHeaders["set-cookie"] = payload.__cookies;
  }

  if (payload?.__raw) {
    response.writeHead(status, {
      ...baseHeaders,
      ...payload.headers,
    });
    response.end(payload.content ?? "");
    return;
  }

  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...baseHeaders,
  });
  // 移除内部字段后序列化
  const { __raw, __cookies, ...clean } = (payload ?? {});
  response.end(Object.keys(clean).length === 0 ? "" : JSON.stringify(clean, null, 2));
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => body[field] === undefined || body[field] === null || body[field] === "");
  if (missing.length > 0) {
    throw badRequest(`Missing required fields: ${missing.join(", ")}`);
  }
}

function mustGet(store, collection, id) {
  const record = store.get(collection, id);
  if (!record) {
    const error = new Error(`${collection} record not found: ${id}`);
    error.statusCode = 404;
    error.code = "not_found";
    throw error;
  }
  return record;
}

function buildFallbackStorageDiagnostics(store) {
  const snapshot = store.snapshot?.() ?? {};
  return {
    driver: "sqlite",
    status: "fallback",
    checkedAt: now(),
    collections: Object.entries(snapshot)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([collection, records]) => ({
        collection,
        collectionCount: Array.isArray(records) ? records.length : 0
      }))
  };
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "bad_request";
  return error;
}

async function writeAuditLog({ store, context, action, resourceType, resourceId = null, metadata = {} }) {
  await store.insert("auditLogs", {
    id: createId("audit"),
    teamId: context.teamId,
    userId: context.userId,
    role: context.role,
    action,
    resourceType,
    resourceId,
    metadata,
    createdAt: now()
  });
}

function normalizeProviderName(value) {
  const providerName = String(value ?? "").toLowerCase();
  if (!["deepseek", "openai"].includes(providerName)) {
    throw badRequest(`Unsupported model provider: ${value}`);
  }
  return providerName;
}

function normalizeFeedbackAction(value) {
  const action = String(value ?? "").toLowerCase();
  if (!["accepted", "edited", "regenerated", "rejected"].includes(action)) {
    throw badRequest(`Unsupported feedback action: ${value}`);
  }
  return action;
}

function normalizeSchemaStatus(value) {
  const status = String(value ?? "").toLowerCase();
  if (!["active", "draft", "deprecated", "archived"].includes(status)) {
    throw badRequest(`Unsupported schema status: ${value}`);
  }
  return status;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function safeFileName(value) {
  return String(value ?? "export")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function summarizeAiRun(run) {
  return {
    id: run.id,
    taskId: run.taskId,
    agentName: run.agentName,
    agentVersion: run.agentVersion,
    promptVersion: run.promptVersion,
    providerName: run.providerName,
    modelName: run.modelName,
    executionMode: run.executionMode,
    status: run.status,
    schemaValidationStatus: run.schemaValidationStatus,
    fallbackUsed: Boolean(run.fallbackUsed),
    fallbackReason: run.fallbackReason ?? null,
    providerAttemptsCount: Array.isArray(run.providerAttempts) ? run.providerAttempts.length : 0,
    retryCount: run.retryCount ?? 0,
    retryOfRunId: run.retryOfRunId ?? null,
    totalTokenCount: run.totalTokenCount ?? 0,
    actualCost: run.actualCost ?? 0,
    latencyMs: run.latencyMs ?? 0,
    errorCode: run.errorCode ?? null,
    warningCode: run.warningCode ?? null,
    costPolicyDecision: run.costPolicyDecision ?? null,
    costPolicyReason: run.costPolicyReason ?? null,
    jsonRepairUsed: Boolean(run.jsonRepairUsed),
    createdAt: run.createdAt,
    completedAt: run.completedAt
  };
}

function summarizePrompt(prompt) {
  const current = prompt.versions?.find((item) => item.version === prompt.currentVersion) ?? prompt.versions?.[0] ?? null;
  return {
    id: prompt.id,
    agentCode: prompt.agentCode,
    name: prompt.name,
    currentVersion: prompt.currentVersion,
    status: prompt.status,
    versionCount: prompt.versions?.length ?? 0,
    outputSchemaId: current?.outputSchemaId ?? null,
    defaultModel: current?.defaultModel ?? null,
    updatedAt: prompt.updatedAt ?? null,
    activatedAt: prompt.activatedAt ?? null
  };
}

function summarizeSchema(schemaRecord) {
  return {
    id: schemaRecord.id,
    name: schemaRecord.name,
    version: schemaRecord.version,
    status: schemaRecord.status,
    requiredCount: schemaRecord.schema?.required?.length ?? 0,
    propertyCount: Object.keys(schemaRecord.schema?.properties ?? {}).length,
    updatedAt: schemaRecord.updatedAt ?? null
  };
}

function detailSchema(schemaRecord) {
  return {
    ...summarizeSchema(schemaRecord),
    schema: schemaRecord.schema
  };
}

function detailPrompt(prompt) {
  return {
    ...summarizePrompt(prompt),
    versions: prompt.versions ?? []
  };
}

function detailAiRun(run, store = null) {
  return {
    ...summarizeAiRun(run),
    teamId: run.teamId,
    projectId: run.projectId,
    agentId: run.agentId,
    promptId: run.promptId,
    schemaId: run.schemaId,
    modelRouteRuleId: run.modelRouteRuleId,
    inputTokenCount: run.inputTokenCount ?? 0,
    outputTokenCount: run.outputTokenCount ?? 0,
    estimatedCost: run.estimatedCost ?? 0,
    errorMessage: run.errorMessage ?? null,
    warningMessage: run.warningMessage ?? null,
    costPolicySnapshot: run.costPolicySnapshot ?? null,
    providerAttempts: run.providerAttempts ?? [],
    outputJson: run.outputJson ?? null,
    outputRawPreview: String(run.outputRaw ?? "").slice(0, 1200),
    outputRawLength: String(run.outputRaw ?? "").length,
    schemaValidationErrors: run.schemaValidationErrors ?? [],
    feedback: store ? summarizeRunFeedback(store, run.id) : null
  };
}

function listFeedbackForRun(store, aiRunId) {
  return store.list("aiQualityFeedback")
    .filter((item) => item.aiRunId === aiRunId)
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
}

function summarizeRunFeedback(store, aiRunId) {
  const feedback = listFeedbackForRun(store, aiRunId);
  return {
    latest: feedback[0] ?? null,
    events: feedback
  };
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "version";
}

function buildAgentInputFromTask(task) {
  return {
    team_id: task.teamId,
    project_id: task.projectId,
    content_title: task.contentTitle,
    platform: task.platform,
    content_goal: task.contentGoal
  };
}

async function runPipelineJob({ store, jobs, taskId }) {
  try {
    const agents = store.list("agents");
    const task = mustGet(store, "tasks", taskId);

    for (const agent of agents) {
      await delay(180);
      const currentTask = store.get("tasks", taskId);
      if (!currentTask || currentTask.status !== "analyzing") break;

      await runAgent({
        store,
        taskId,
        agentName: agent.code,
        input: buildAgentInputFromTask(task),
        promptVersion: "latest"
      });

      const job = getPipelineJob({ store, jobs, taskId });
      if (job) {
        job.completedAgents += 1;
        await savePipelineJob({ store, jobs, job });
      }
    }

    const runs = store.list("aiRuns").filter((run) => run.taskId === taskId);
    const hasFailedRuns = runs.some((run) => run.status !== "success");
    const finalStatus = runs.length === agents.length && !hasFailedRuns ? "completed" : runs.length > 0 ? "partially_failed" : "failed";
    assertTransition("analyzing", finalStatus);
    await store.update("tasks", taskId, { status: finalStatus, completedAt: now() });
    await savePipelineJob({ store, jobs, job: {
      ...(getPipelineJob({ store, jobs, taskId }) ?? {}),
      taskId,
      status: finalStatus,
      completedAgents: runs.length,
      totalAgents: agents.length,
      completedAt: now(),
      error: null
    } });

    // BL-018: 归因管线集成 — Agent管线完成后自动触发归因分析
    if (finalStatus === "completed" || finalStatus === "partially_failed") {
      try {
        const comments = store.list("comments").filter(c => c.taskId === taskId);
        const categories = store.list("categoryKnowledge");
        if (comments.length > 0 && categories.length > 0) {
          const attributionInput = {
            taskId,
            content: {
              title: task.contentTitle || task.taskName || "",
              body: task.contentBody || "",
              platform: task.platform || "douyin",
              brandInfo: task.brandInfo || ""
            },
            signals: { signals: [], comments },
            categoryKnowledge: categories[0],
            llmCall: mockLlmCall
          };
          const result = await runAttribution(attributionInput);
          const attrId = createId("attr");
          await store.insert("attributionResults", {
            id: attrId, taskId,
            result: result.attributionMatrix,
            contentGaps: result.contentGaps,
            sellingPointRanking: result.sellingPointRanking,
            contentPoints: result.contentPoints,
            createdAt: now()
          });
        }
      } catch (attrErr) {
        // 归因失败不影响管线主流程
        console.error("[pipeline] Attribution failed:", attrErr.message);
      }
    }
  } catch (error) {
    const runs = store.list("aiRuns").filter((run) => run.taskId === taskId);
    const failedStatus = runs.length > 0 ? "partially_failed" : "failed";
    await store.update("tasks", taskId, { status: failedStatus, completedAt: now() });
    await savePipelineJob({ store, jobs, job: {
      ...(getPipelineJob({ store, jobs, taskId }) ?? {}),
      taskId,
      status: failedStatus,
      completedAgents: runs.length,
      totalAgents: store.list("agents").length,
      completedAt: now(),
      error: error.message
    } });
  }
}

function buildTaskStatusPayload({ store, jobs, taskId, queued = false }) {
  const task = mustGet(store, "tasks", taskId);
  const runs = store.list("aiRuns").filter((run) => run.taskId === taskId);
  const job = getPipelineJob({ store, jobs, taskId });
  const stages = getPipelineStages();
  const totalAgents = job?.totalAgents ?? stages.reduce((sum, s) => sum + s.agentCount, 0);
  const completedAgents = runs.filter(r => r.status === "success").length;

  // 按stage统计进度
  const stageProgress = stages.map(s => {
    const stageRuns = s.agents.map(code => runs.find(r => r.agentName === code)).filter(Boolean);
    return {
      id: s.id, label: s.label, icon: s.icon,
      total: s.agentCount,
      completed: stageRuns.filter(r => r.status === "success").length,
      failed: stageRuns.filter(r => r.status === "failed").length,
      pending: s.agentCount - stageRuns.length,
      status: stageRuns.length === 0 ? "pending"
        : stageRuns.every(r => r.status === "success") ? "completed"
        : stageRuns.some(r => r.status === "failed") ? "failed" : "running"
    };
  });

  return {
    task,
    runs,
    queued,
    stages: stageProgress,
    progress: {
      totalAgents,
      completedAgents,
      totalStages: stages.length,
      completedStages: stageProgress.filter(s => s.status === "completed").length,
      percent: totalAgents === 0 ? 0 : Math.round((completedAgents / totalAgents) * 100),
      activeAgentIndex: task.status === "analyzing" ? completedAgents : null,
      jobStatus: job?.status ?? task.status,
      error: job?.error ?? null
    }
  };
}

function getPipelineJob({ store, jobs, taskId }) {
  return store.getPipelineJob?.(taskId) ?? jobs.get(taskId) ?? null;
}

async function savePipelineJob({ store, jobs, job }) {
  const saved = await (store.savePipelineJob?.(job) ?? job);
  jobs.set(saved.taskId, saved);
  return saved;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==================== Skill Learning Handlers ====================

async function getSkillMetrics({ store, query, context }) {
  requirePermission(context, PERMISSIONS.COST_READ);
  const period = query.get("period") ?? "current_month";
  const teamId = query.get("teamId") ?? context.teamId;
  return { data: buildSkillMetrics({ store, teamId, period }) };
}

async function getSkillIterationHistory({ store, params, context }) {
  requirePermission(context, PERMISSIONS.COST_READ);
  const agentCode = params[0];
  return { data: buildSkillIterationHistory({ store, agentCode }) };
}

// BL-003/004: 归因分析 handlers
async function runTaskAttribution({ store, params, context }) {
  requirePermission(context, PERMISSIONS.AI_RUN_WRITE);
  const taskId = params[0];
  const task = store.get("tasks", taskId);
  if (!task) {
    const error = new Error("Task not found");
    error.statusCode = 404;
    error.code = "not_found";
    throw error;
  }

  // 获取输入数据
  const signals = await getTaskCommentSignals({ store, params, context });
  const categoryKnowledge = store.list("categoryKnowledge");
  const category = categoryKnowledge[0] || null;

  // 构建归因输入
  const input = {
    taskId,
    content: {
      title: task.contentTitle || task.taskName || "",
      body: task.contentBody || task.description || "",
      platform: task.platform || "抖音",
      brandInfo: task.brandInfo || ""
    },
    signals: signals.data || signals,
    categoryKnowledge: category,
    llmCall: mockLlmCall // mock 模式下的 LLM 调用
  };

  // 执行归因分析
  const result = await runAttribution(input);

  // 保存结果
  const attributionId = createId("attr");
  await store.insert("attributionResults", {
    id: attributionId,
    taskId,
    result: result.attributionMatrix,
    contentGaps: result.contentGaps,
    sellingPointRanking: result.sellingPointRanking,
    contentPoints: result.contentPoints,
    metadata: result._metadata,
    createdAt: now()
  });

  return { data: { attributionId, ...result } };
}

async function getTaskAttribution({ store, params, context }) {
  requirePermission(context, PERMISSIONS.TASK_READ);
  const taskId = params[0];

  const attrs = store.list("attributionResults");
  const attr = attrs.find(a => a.taskId === taskId);
  if (!attr) {
    return { data: { message: "No attribution data yet. Run attribution first." } };
  }

  return { data: attr };
}

// Mock LLM call for attribution/production (will be replaced by real model-gateway calls)
function mockLlmCall(model, messages) {
  const userMsg = messages.find(m => m.role === "user")?.content || "";
  const insightCount = (userMsg.match(/"text"/g) || []).length || 5;

  const mockInsights = Array.from({ length: Math.min(insightCount, 5) }, (_, i) => ({
    contentPointId: `cp_${i + 1}`,
    insightText: `该内容要点引发了用户的${i % 2 === 0 ? "正面共鸣" : "质疑反应"}，因为表达方式${i % 2 === 0 ? "准确传达了产品价值" : "未能充分解释产品优势"}。建议下一条内容中${i % 2 === 0 ? "保持这种表达方式" : "增加数据支撑和案例说明"}。`,
    nextAction: i % 2 === 0 ? "保持并放大" : "增加信任背书后重试"
  }));

  return JSON.stringify({ insights: mockInsights });
}

// BL-008: 内容生产卡 handlers
async function generateTaskProductionCard({ store, params, context, body }) {
  requirePermission(context, PERMISSIONS.AI_RUN_WRITE);
  const taskId = params[0];
  const task = store.get("tasks", taskId);
  if (!task) {
    const error = new Error("Task not found");
    error.statusCode = 404; error.code = "not_found"; throw error;
  }

  const platform = body.platform || "douyin";
  const categoryKnowledge = store.list("categoryKnowledge");
  const category = categoryKnowledge[0] || null;

  // 获取归因结果
  const attrs = store.list("attributionResults");
  const attr = attrs.find(a => a.taskId === taskId);
  const attribution = attr || {};

  // 生成生产卡
  const card = await generateProductionCard({
    attribution,
    categoryKnowledge: category,
    content: {
      title: task.contentTitle || task.taskName || "",
      body: task.contentBody || "",
      brandInfo: task.brandInfo || ""
    },
    platform,
    llmCall: mockLlmCall
  });

  // 保存
  const qcResult = runQualityCheck(card);
  const cardId = createId("card");
  await store.insert("productionCards", {
    id: cardId,
    taskId,
    ...card,
    quality_check_result: qcResult,
    status: qcResult.verdict === "approve" ? "approved" : "draft",
    agent_run_id: null,
    created_at: now(),
    updated_at: now()
  });

  return { data: { id: cardId, qualityCheck: qcResult, ...card } };
}

async function listTaskProductionCards({ store, params, context }) {
  requirePermission(context, PERMISSIONS.TASK_READ);
  const taskId = params[0];
  const cards = store.list("productionCards").filter(c => c.taskId === taskId);
  return { data: cards };
}

async function getProductionCard({ store, params, context }) {
  requirePermission(context, PERMISSIONS.TASK_READ);
  const card = store.get("productionCards", params[0]);
  if (!card) {
    const error = new Error("Production card not found");
    error.statusCode = 404; error.code = "not_found"; throw error;
  }
  return { data: card };
}

async function runQualityCheckHandler({ store, params, context }) {
  requirePermission(context, PERMISSIONS.AI_RUN_WRITE);
  const card = store.get("productionCards", params[0]);
  if (!card) {
    const error = new Error("Production card not found");
    error.statusCode = 404; error.code = "not_found"; throw error;
  }

  const qcResult = runQualityCheck(card);
  await store.update("productionCards", card.id, {
    quality_check_result: qcResult,
    status: qcResult.verdict === "approve" ? "approved" : "draft",
    updated_at: now()
  });

  return { data: qcResult };
}

async function generateCommentOpsHandler({ store, params, context }) {
  requirePermission(context, PERMISSIONS.TASK_READ);
  const taskId = params[0];
  const task = store.get("tasks", taskId);
  if (!task) { const e = new Error("Not found"); e.statusCode = 404; e.code = "not_found"; throw e; }

  const attrs = store.list("attributionResults");
  const attr = attrs.find(a => a.taskId === taskId) || {};
  const categoryKnowledge = store.list("categoryKnowledge");
  const ops = generateCommentOps({ attribution: attr, categoryKnowledge: categoryKnowledge[0], platform: task.platform || "douyin" });
  return { data: ops };
}

async function scoreAdFitHandler({ store, params, context }) {
  requirePermission(context, PERMISSIONS.TASK_READ);
  const card = store.get("productionCards", params[0]);
  if (!card) { const e = new Error("Not found"); e.statusCode = 404; e.code = "not_found"; throw e; }

  const attrs = store.list("attributionResults");
  const attr = attrs.find(a => a.taskId === card.taskId) || {};
  const result = scoreAdFit(card, attr);
  return { data: result };
}

async function listReportTemplatesHandler() {
  return { data: listReportTemplates() };
}

async function generateWhiteLabelReport({ store, context, body }) {
  requirePermission(context, PERMISSIONS.REPORT_WRITE);
  const { template, whiteLabelConfig, reportData } = body || {};
  const result = buildWhiteLabelReport({ reportData, template: template || "weekly", whiteLabelConfig });
  return { data: result };
}
