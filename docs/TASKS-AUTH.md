# Vocos 登录认证与权限管理 — 实现任务列表

> **版本**：v1.0  
> **作者**：高见远（架构师）  
> **日期**：2026-06-06  
> **关联文档**：`docs/PRD-AUTH.md` / `docs/ARCH-AUTH.md`  
> **总任务数**：31 个  
> **预估 Phase**：7 个

---

## Phase 依赖关系

```
Phase 1 (auth.mjs 重写)
  ├── Phase 2 (server.mjs 路由)
  │     ├── Phase 3 (前端 AuthContext + AuthGuard)
  │     │     ├── Phase 4 (前端 LoginPage + RegisterPage)
  │     │     └── Phase 5 (App.tsx + 侧边栏权限化)
  │     └── Phase 6 (种子数据 + middleware 接入)
  └── Phase 7 (集成测试，依赖 Phase 1-6 全部完成)
```

---

## Phase 1：后端 auth.mjs 重写

> **目标**：将 56 行桩代码扩展为完整认证授权模块  
> **原则**：零外部依赖，仅使用 Node.js 内置 `crypto` 模块

---

### T-AUTH-01: PERMISSIONS 枚举扩展 + 角色权限映射表

- **依赖**：无
- **文件**：`backend/src/auth.mjs`
- **说明**：
  - 在现有 15 项权限定义基础上，新增 `TEAM_MANAGE: "team.manage"`、`USER_MANAGE: "user.manage"`
  - 新增 `ROLE_PERMISSIONS` 常量：`{ super_admin: [...17项], team_admin: [...13项], ai_engineer_admin: [...11项], member: [...3项] }`
  - 将 `ALL_PERMISSIONS` 改为从 `ROLE_PERMISSIONS` 动态计算
  - 保留 `PERMISSIONS` 导出不变，确保现有业务 handler 引用 `PERMISSIONS.TASK_READ` 等不报错
- **验收**：
  - `PERMISSIONS.TEAM_MANAGE === "team.manage"` ✅
  - `PERMISSIONS.USER_MANAGE === "user.manage"` ✅
  - `ROLE_PERMISSIONS.super_admin.length === 17` ✅
  - `ROLE_PERMISSIONS.member.length === 3` ✅
  - 现有代码中 `requirePermission(context, PERMISSIONS.TASK_READ)` 仍可正常调用 ✅

---

### T-AUTH-02: JWT 工具函数实现（signToken + verifyToken）

- **依赖**：无（纯工具函数）
- **文件**：`backend/src/auth.mjs`
- **说明**：
  - 实现 `base64urlEncode(str)` / `base64urlDecode(str)`（`Buffer.toString("base64url")` / `Buffer.from(str, "base64url")`）
  - 实现 `signToken(payload, expiresInStr)`：
    - header: `{"alg":"HS256","typ":"JWT"}`
    - 自动注入 `iat`、`exp`（根据 expiresInStr 计算）、`jti`（`crypto.randomUUID()`）
    - 签名：`crypto.createHmac("sha256", JWT_SECRET).update(unsignedToken).digest("base64url")`
  - 实现 `verifyToken(token)`：
    - 按 `.` 分割 → 验证签名（`crypto.timingSafeEqual`）→ 检查 `exp` → 返回 `{ payload, jti }`
    - 签名无效 throw `invalid_token`
    - 过期 throw `token_expired`
  - `JWT_SECRET` 从 `process.env.VOCOS_JWT_SECRET` 读取，默认 `vocos-dev-secret-change-in-production`
- **验收**：
  - `signToken({ sub: "test" }, "15m")` 返回合法 JWT 字符串 ✅
  - `verifyToken(合法JWT)` 返回正确的 `{ payload: { sub: "test", iat: ..., exp: ..., jti: ... }, jti }` ✅
  - `verifyToken(被篡改的JWT)` throw `invalid_token` ✅
  - `verifyToken(过期JWT)` throw `token_expired` ✅
  - `verifyToken(格式错误的字符串)` throw `invalid_token` ✅

---

### T-AUTH-03: 密码哈希工具函数（hashPassword + verifyPassword）

- **依赖**：无（纯工具函数）
- **文件**：`backend/src/auth.mjs`
- **说明**：
  - 实现 `hashPassword(password)`：
    - `salt = crypto.randomBytes(16)`
    - `hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })`
    - 返回 `"<salt_hex>:<hash_hex>"`
  - 实现 `verifyPassword(password, stored)`：
    - 解析 `salt:hash` → 重新计算 scrypt → `crypto.timingSafeEqual` 比较
  - 密码长度校验（≥ 8 位）在调用方处理，本函数不做校验
- **验收**：
  - `hashPassword("demo123456")` 返回 130+ 字符的 `hex:hex` 字符串 ✅
  - `verifyPassword("demo123456", hash)` → `true` ✅
  - `verifyPassword("wrong", hash)` → `false` ✅
  - 两次调用 `hashPassword("same")` 返回不同结果（salt 不同）✅

---

### T-AUTH-04: Token 黑名单管理

- **依赖**：无
- **文件**：`backend/src/auth.mjs`
- **说明**：
  - 使用 `Map` 实现内存黑名单：`Map<jti, { family, expiresAt }>`
  - 实现 `addToBlacklist(jti, family, expiresAt)` — 单个 jti 加入黑名单
  - 实现 `isBlacklisted(jti)` — 检查 jti 是否在黑名单
  - 实现 `revokeFamily(family)` — 将该 family 下所有 token 加入黑名单（防止重放）
  - 实现 `cleanupBlacklist()` — 清理过期条目（在 refresh handler 中调用）
  - 模块导出时不暴露内部 Map，只暴露上述四个函数
- **验收**：
  - `addToBlacklist("jti1", "fam1", Date.now() + 60000)` 后 `isBlacklisted("jti1")` → `true` ✅
  - `revokeFamily("fam1")` 后该 family 所有 token 被标记 ✅
  - 过期 token 在 `cleanupBlacklist()` 后被清除 ✅

---

### T-AUTH-05: buildRequestContext 重构

- **依赖**：T-AUTH-02（verifyToken）
- **文件**：`backend/src/auth.mjs`
- **说明**：
  - 从 `headers["x-user-id"]` 读取改为从 `headers["authorization"]` 读取 Bearer Token
  - 调用 `verifyToken(token)` 获取 payload
  - 从 payload 提取 `sub`、`name`、`role`、`team_id`、`team_name`、`permissions`
  - 从 DB 查询 user/team 验证数据完整性
  - **开发环境降级**：`NODE_ENV !== "production"` 时，若无 Bearer Token，回退到 `x-user-id` / `x-team-id` Header 读取，权限从 `ROLE_PERMISSIONS` 按角色映射
- **验收**：
  - 携带合法 Bearer Token 时，正确解析返回 context ✅
  - 无 Token 且非开发环境时，throw `401 no_token` ✅
  - 无 Token 且开发环境时，从 Header 降级读取 ✅
  - Token 中 user 在 DB 中不存在或 status ≠ active → throw 401 ✅

---

### T-AUTH-06: requirePermission / assertTeamAccess / filterByTeam 真实实现

- **依赖**：T-AUTH-01（PERMISSIONS）、T-AUTH-05（context）
- **文件**：`backend/src/auth.mjs`
- **说明**：
  - `requirePermission(context, permission)`：
    - 检查 `context.permissions` 是否为数组 → 不是则 throw 403
    - 检查 `context.permissions.includes(permission)` → 不是则 throw 403
  - `assertTeamAccess(context, resourceTeamId)`：
    - `context.role === "super_admin"` → 直接通过
    - `context.teamId === resourceTeamId` → 通过
    - 否则 throw 403 `not_team_member`
  - `filterByTeam(context, records)`：
    - `context.role === "super_admin"` → 返回全部
    - 否则 `records.filter(r => r.teamId === context.teamId)`
  - 新增 `forbiddenError(message)` 辅助函数
- **验收**：
  - `requirePermission({ permissions: ["task.read"] }, "task.read")` → 无异常 ✅
  - `requirePermission({ permissions: ["task.read"] }, "task.write")` → throw 403 ✅
  - `assertTeamAccess({ role: "member", teamId: "t1" }, "t1")` → 无异常 ✅
  - `assertTeamAccess({ role: "member", teamId: "t1" }, "t2")` → throw 403 ✅
  - `assertTeamAccess({ role: "super_admin", teamId: "t1" }, "t2")` → 无异常 ✅
  - `filterByTeam({ role: "member", teamId: "t1" }, [{ teamId: "t1" }, { teamId: "t2" }])` → 返回 1 条 ✅
  - `filterByTeam({ role: "super_admin" }, records)` → 返回全部 ✅

---

### T-AUTH-07: 登录失败锁定逻辑

- **依赖**：无
- **文件**：`backend/src/auth.mjs`
- **说明**：
  - 实现 `checkLoginLock(email)` → `{ locked: boolean, remaining?: number }`
  - 实现 `recordLoginFailure(email)` — 递增失败计数，达到 5 次锁定 15 分钟
  - 实现 `clearLoginFailures(email)` — 登录成功后清除计数
  - 使用 `Map<email, { count, lockedUntil }>` 内存存储
- **验收**：
  - 新邮箱 `checkLoginLock` → `{ locked: false }` ✅
  - 连续 5 次 `recordLoginFailure` 后 → `checkLoginLock` → `{ locked: true, remaining: ... }` ✅
  - `clearLoginFailures` 后 → `checkLoginLock` → `{ locked: false }` ✅

---

## Phase 2：server.mjs 路由添加

> **目标**：添加 8 个 auth API 端点，CORS 安全改造，限流器  
> **依赖**：Phase 1 全部完成

---

### T-AUTH-08: send() 函数 CORS 安全改造

- **依赖**：无
- **文件**：`backend/src/server.mjs`
- **说明**：
  - 新增 `ALLOWED_ORIGINS` 白名单（生产环境 `["https://vocosai.com"]`，开发环境 `["http://localhost:5173", "http://127.0.0.1:3000", "http://localhost:3000"]`）
  - 修改 `send()` 函数：将 `access-control-allow-origin: *` 改为精确 Origin 匹配
  - 添加 `access-control-allow-credentials: true`（支持跨域 Cookie）
  - 修改 `access-control-allow-headers` 为 `Content-Type, Authorization`（移除已废弃的 x-user-id/x-team-id）
  - 添加安全响应头：`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`
  - OPTIONS 预检请求同样返回这些头
- **验收**：
  - `OPTIONS /api/xxx` 返回 204，包含正确的 CORS 头 ✅
  - 生产环境仅允许 `https://vocosai.com` 的跨域请求 ✅
  - 开发环境允许 `localhost:5173` 跨域 ✅
  - 响应包含 `X-Content-Type-Options: nosniff` ✅
  - 响应包含 `X-Frame-Options: DENY` ✅

---

### T-AUTH-09: 请求限流器（内存）

- **依赖**：无
- **文件**：`backend/src/server.mjs`
- **说明**：
  - 实现 `checkRateLimit(key, maxAttempts, windowMs)` → `boolean`
  - 在 `send()` 中调用（或作为 handler wrapper），`ip` 从 `x-forwarded-for` 或 `request.socket.remoteAddress` 提取
  - 登录接口限流：`checkRateLimit("login:" + ip, 5, 60000)` — 5 次/分钟
  - 注册接口限流：`checkRateLimit("register:" + ip, 3, 60000)` — 3 次/分钟
  - 限流超限时返回 `429 { error: "too_many_attempts" }`
- **验收**：
  - 1 分钟内登录请求 ≤ 5 次 → 正常处理 ✅
  - 1 分钟内登录请求 > 5 次 → 返回 429 ✅
  - 1 分钟后计数器重置 → 可再次请求 ✅

---

### T-AUTH-10: POST /api/auth/login 路由

- **依赖**：T-AUTH-02、T-AUTH-03、T-AUTH-04、T-AUTH-05、T-AUTH-07、T-AUTH-09
- **文件**：`backend/src/server.mjs`
- **说明**：
  - 路由：`["POST", /^\/api\/auth\/login$/, handleLogin]`
  - 请求体：`{ email: string, password: string }`
  - 处理流程：
    1. 校验必填字段
    2. 邮箱规范化（trim + lowercase）
    3. `checkLoginLock(email)` — 若锁定返回 429
    4. 从 DB 查 user（`users` 表按 `email` 查找）
    5. 用户不存在 → `recordLoginFailure` → 返回 401 `invalid_credentials`
    6. `verifyPassword(password, user.password_hash)` → 失败同上
    7. 成功：`clearLoginFailures(email)` → 查 team_members → 构造 payload → `signToken(accessPayload, "15m")` → `signToken(refreshPayload, "7d")`
    8. 响应：`{ data: { accessToken, user, team, permissions } }` + `Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=604800`
  - 统一错误消息："邮箱或密码错误"（不区分用户不存在 vs 密码错误）
- **验收**：
  - 正确邮箱+密码 → 200，返回 accessToken + Set-Cookie ✅
  - 错误密码 → 401 `invalid_credentials`，message = "邮箱或密码错误" ✅
  - 不存在邮箱 → 401（同消息）✅
  - 缺失必填字段 → 400 `bad_request` ✅
  - 第 5 次错误尝试后 → 429 `too_many_attempts` ✅

---

### T-AUTH-11: POST /api/auth/register 路由

- **依赖**：T-AUTH-02、T-AUTH-03、T-AUTH-09
- **文件**：`backend/src/server.mjs`
- **说明**：
  - 路由：`["POST", /^\/api\/auth\/register$/, handleRegister, 201]`
  - 请求体：`{ name: string, email: string, password: string, teamName?: string, inviteCode?: string }`
  - 处理流程：
    1. 校验 `name`、`email`、`password` 非空
    2. 校验 `password.length >= 8`
    3. 邮箱规范化 → 查 DB 是否已存在 → 存在返回 409 `email_exists`
    4. 团队逻辑：
       - 有 `inviteCode` → 查 teams 表校验有效 → 加入团队 → role = `member`
       - 有 `teamName` → 创建新团队 + 加入 → role = `team_admin`
       - 都无 → 根据团队名自动创建一个默认团队 → role = `team_admin`
    5. `hashPassword(password)` → 写入 `users` 表
    6. 签发 Token 对 → 返回 `{ data: { accessToken, user, team, permissions } }` + Set-Cookie
  - 注册成功自动登录
- **验收**：
  - 全新邮箱注册 → 201，返回 Token + 用户信息 ✅
  - 重复邮箱 → 409 `email_exists` ✅
  - 密码 < 8 位 → 400 `bad_request` ✅
  - 注册成功 → users/teams/team_members 三表均正确写入 ✅
  - 注册时指定 teamName → 新建团队且角色为 team_admin ✅
  - 注册时指定 inviteCode → 加入已有团队且角色为 member ✅

---

### T-AUTH-12: POST /api/auth/logout 路由

- **依赖**：T-AUTH-02、T-AUTH-04、T-AUTH-05
- **文件**：`backend/src/server.mjs`
- **说明**：
  - 路由：`["POST", /^\/api\/auth\/logout$/, handleLogout]`
  - 鉴权：Bearer Token（需要认证中间件）
  - 处理流程：
    1. 从 Authorization Header 解析 Access Token jti
    2. `addToBlacklist(accessJti, "-", exp)` — Access Token 加入黑名单
    3. 从 Cookie 解析 Refresh Token jti → `addToBlacklist(refreshJti, family, exp)`
    4. 返回 `{ data: { ok: true } }` + `Clear-Cookie` 头
  - Cookie 清除：`Set-Cookie: refreshToken=; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=0`
- **验收**：
  - 已登录用户 logout → 200 `{ data: { ok: true } }` ✅
  - logout 后原 Access Token → 401（jti 在黑名单）✅
  - logout 后 Refresh Token → refresh 接口返回 403 ✅
  - 无 Token 请求 logout → 401 `unauthorized` ✅

---

### T-AUTH-13: POST /api/auth/refresh 路由

- **依赖**：T-AUTH-02、T-AUTH-04
- **文件**：`backend/src/server.mjs`
- **说明**：
  - 路由：`["POST", /^\/api\/auth\/refresh$/, handleRefreshToken]`
  - 鉴权：Cookie 中的 `refreshToken`（非 Bearer Token）
  - 处理流程：
    1. 从 Cookie 提取 `refreshToken`
    2. `verifyToken(refreshToken)` → 获取 `{ payload: { sub, jti, family }, jti }`
    3. 检查 `isBlacklisted(jti)`：
       - 是 → `revokeFamily(family)` → 返回 403 `token_reused`
       - 否 → 继续
    4. `addToBlacklist(jti, family, payload.exp)`（旧 Refresh Token 失效）
    5. 查 DB 获取最新 user/团队/权限信息
    6. `signToken(newAccessPayload, "15m")` + `signToken(newRefreshPayload, "7d")`（同 family，新 jti）
    7. `cleanupBlacklist()`
    8. 返回 `{ data: { accessToken, user, team, permissions } }` + Set-Cookie（新 Refresh Token）
  - Cookie 提取：从 `request.headers["cookie"]` 中解析 `refreshToken=...`
- **验收**：
  - 有效 Refresh Token → 200，返回新 Access Token + 新 Refresh Token ✅
  - 过期 Refresh Token → 401 `unauthorized` ✅
  - 已撤销 Refresh Token（正常刷新后旧 token）→ 403 `token_reused` ✅
  - 重用检测：同 family 所有 token 失效 ✅

---

### T-AUTH-14: GET /api/auth/me 路由

- **依赖**：T-AUTH-05（context）
- **文件**：`backend/src/server.mjs`
- **说明**：
  - 路由：`["GET", /^\/api\/auth\/me$/, handleGetMe]`
  - 鉴权：Bearer Token（由 `buildRequestContext` 处理）
  - 从 `context.user`、`context.team`、`context.permissions` 构造响应
  - 返回 `{ data: { user, team, permissions } }`
  - 注意此路由在现有 `GET /api/auth/context` 路由之后注册，新旧立正同时保留
- **验收**：
  - 携带合法 Token → 200，返回用户完整信息 ✅
  - 无 Token → 401 ✅
  - 返回字段包含 `user.id`, `user.email`, `user.role`, `permissions[]` ✅

---

### T-AUTH-15: PUT /api/auth/me 路由（更新个人资料）

- **依赖**：T-AUTH-05
- **文件**：`backend/src/server.mjs`
- **说明**：
  - 路由：`["PUT", /^\/api\/auth\/me$/, handleUpdateMe]`
  - 鉴权：Bearer Token
  - 请求体：`{ name?: string, phone?: string, avatarUrl?: string }`
  - 更新 `users` 表中当前用户的对应字段
  - 返回 `{ data: { user } }`
- **验收**：
  - 更新 name → 200，返回更新后的 user ✅
  - 更新多个字段 → 仅更新请求中存在的字段 ✅
  - 空请求体 → 400 `bad_request` ✅

---

### T-AUTH-16: PUT /api/auth/me/password 路由（修改密码）

- **依赖**：T-AUTH-03、T-AUTH-05
- **文件**：`backend/src/server.mjs`
- **说明**：
  - 路由：`["PUT", /^\/api\/auth\/me\/password$/, handleChangePassword]`
  - **注意**：必须在 `PUT /api/auth/me` 路由**之前**注册（正则匹配顺序）
  - 鉴权：Bearer Token
  - 请求体：`{ oldPassword: string, newPassword: string }`
  - 处理流程：
    1. 校验 `oldPassword`、`newPassword` 非空
    2. 校验 `newPassword.length >= 8`
    3. `verifyPassword(oldPassword, user.password_hash)` → 不匹配返回 400
    4. `hashPassword(newPassword)` → 更新 `users.password_hash`
    5. 返回 `{ data: { ok: true } }`
  - 密码修改后 Token 不失效（保持当前会话）
- **验收**：
  - 正确旧密码 + 新密码 ≥ 8 位 → 200 ✅
  - 错误旧密码 → 400，message 为 "旧密码不正确" ✅
  - 新密码 < 8 位 → 400 `bad_request` ✅
  - 修改后可用新密码重新登录 ✅

---

## Phase 3：前端 AuthContext + AuthGuard

> **目标**：认证状态管理、Token 注入、路由守卫  
> **依赖**：Phase 2 全部完成（后端 auth API 就绪）

---

### T-AUTH-17: api.ts 改造（Token 注入 + 401 自动刷新）

- **依赖**：Phase 2 后端 API 就绪
- **文件**：`frontend/src/shared/services/api.ts`
- **说明**：
  - 新增 `let accessToken: string | null = null` 变量（模块级，内存）
  - 新增 `export function setAccessToken(token: string | null)` 导出
  - 修改 `request()` 函数：
    - 添加 `Authorization: Bearer ${accessToken}` Header（当 accessToken 存在时）
    - 添加 `credentials: "include"`（所有请求携带 Cookie）
    - 当响应 `res.status === 401` 且 path ≠ `/auth/refresh` 时，调用 `refreshAccessToken()`
    - refresh 成功：重试原请求
    - refresh 失败：`window.location.href = "/login"`
  - 实现 `refreshAccessToken()`：
    - 防止并发刷新请求（`let refreshPromise`）
    - `POST /api/auth/refresh` → `credentials: "include"`
    - 成功 → `setAccessToken(data.accessToken)` → 返回新 Token
    - 失败 → 返回 null
  - 修改 `error` 处理：当状态码非 2xx 且 path ≠ `/auth/refresh` 时，解析 `{ error, message }` 格式并 throw `new Error(message)`
- **验收**：
  - 设置 accessToken 后，所有请求携带 `Authorization: Bearer <token>` ✅
  - 401 响应自动触发 `/auth/refresh` ✅
  - 刷新成功自动重试原请求 ✅
  - 刷新失败跳转 `/login` ✅
  - 并发多个 401 请求时，只有一个 refresh 请求 ✅

---

### T-AUTH-18: AuthContext.tsx 实现

- **依赖**：T-AUTH-17（api.ts）
- **文件**：`frontend/src/shared/auth/AuthContext.tsx`
- **说明**：
  - 创建 `AuthContext = React.createContext(null)`
  - 实现 `AuthProvider`：
    - 使用 `useReducer` 管理 `AuthState`
    - 挂载时 `useEffect` → 调用 `POST /api/auth/refresh` 尝试恢复登录态 → 成功则调用 `GET /api/auth/me` 获取用户信息 → 设置认证状态
    - 暴露方法：`login`、`register`、`logout`、`refreshToken`、`updateProfile`、`changePassword`
    - `login(email, password)`：调用 fetch `POST /api/auth/login`，成功 → `setAccessToken` → dispatch `LOGIN_SUCCESS`
    - `register(data)`：调用 fetch `POST /api/auth/register`，成功 → 同 login 流程
    - `logout()`：调用 fetch `POST /api/auth/logout` → `setAccessToken(null)` → dispatch `LOGOUT`
    - `hasPermission(p)`: `state.permissions.includes(p)`
    - `hasAllPermissions(ps)`: `ps.every(p => state.permissions.includes(p))`
  - 导出 `useAuth()` hook：`useContext(AuthContext)` + 空值校验
- **验收**：
  - 有有效 Refresh Token Cookie → 自动恢复登录态（无需重新登录）✅
  - 无有效 Refresh Token → `isAuthenticated = false`，`isLoading = false` ✅
  - `login("admin@vocos.local", "demo123456")` → 更新认证状态 ✅
  - `hasPermission("task.read")` 根据用户角色返回正确结果 ✅
  - `logout()` 后 accessToken 清除，跳转 login ✅

---

### T-AUTH-19: AuthGuard.tsx 实现

- **依赖**：T-AUTH-18（AuthContext）
- **文件**：`frontend/src/shared/auth/AuthGuard.tsx`
- **说明**：
  - props：`children`、`requiredPermissions?: string[]`
  - 逻辑：
    - `isLoading` → 渲染 `<FullScreenLoader />`（全屏居中 loading spinner）
    - `!isAuthenticated` → `<Navigate to="/login" replace />`
    - `requiredPermissions` 有权限要求且不满足 → `<Navigate to="/403" replace />`
    - 否则渲染 `children`
  - 使用 `react-router-dom` 的 `Navigate` 组件
- **验收**：
  - 未登录访问需认证页面 → 跳转 `/login` ✅
  - 已登录但无 `task.write` 权限访问需要该权限的页面 → 跳转 `/403` ✅
  - 已登录且有权限 → 正常渲染子元素 ✅
  - 初始加载中 → 显示加载动画，不跳转 ✅

---

### T-AUTH-20: main.tsx 包裹 AuthProvider

- **依赖**：T-AUTH-18（AuthProvider）
- **文件**：`frontend/src/main.tsx`
- **说明**：
  - `import { AuthProvider } from "./shared/auth/AuthContext"`
  - 在 `<App />` 外层包裹 `<AuthProvider>`
  - 保持 `React.StrictMode` 包裹不变
- **验收**：
  - 应用启动后 AuthProvider 正确初始化 ✅
  - `useAuth()` 在 App 内的任何组件可用 ✅

---

## Phase 4：前端认证页面

> **目标**：LoginPage + RegisterPage + ForbiddenPage  
> **依赖**：Phase 3 全部完成

---

### T-AUTH-21: LoginPage.tsx 实现

- **依赖**：T-AUTH-18（useAuth）
- **文件**：`frontend/src/features/auth/LoginPage.tsx`
- **说明**：
  - 纯表单页面（不使用 MainLayout 侧边栏）
  - 布局：居中卡片，Vocos Logo + 标题
  - 表单字段：邮箱（TextField）、密码（TextField + 显示/隐藏切换）
  - "记住我"复选框可忽略（PRD 提到但不影响 P0 交付）
  - 提交按钮："登录"
  - 底部链接："还没有账号？立即注册 →"（`<Link to="/register">`）
  - 表单验证：
    - 邮箱非空 + 基本 email 格式校验
    - 密码非空
  - 错误处理：`login()` 异常时显示错误消息（红色提示文字）
  - 登录成功 → `login()` 内部自动跳转到 `/`
  - 如果已登录（`isAuthenticated && !isLoading`）→ `<Navigate to="/" />`
- **验收**：
  - 页面在 `/login` 路径正确渲染 ✅
  - 输入邮箱密码点击登录 → 调用 auth API ✅
  - 错误凭据 → 显示 "邮箱或密码错误" ✅
  - 正确凭据 → 跳转到 `/`（主界面）✅
  - 已登录用户访问 `/login` → 自动跳转到 `/` ✅
  - 点击"注册"链接 → 跳转到 `/register` ✅

---

### T-AUTH-22: RegisterPage.tsx 实现

- **依赖**：T-AUTH-18（useAuth）
- **文件**：`frontend/src/features/auth/RegisterPage.tsx`
- **说明**：
  - 纯表单页面，居中卡片布局
  - 表单字段：姓名、邮箱、密码（≥8位）、团队名称（可选）
  - 提交按钮："注册"
  - 底部链接："已有账号？返回登录 →"（`<Link to="/login">`）
  - 表单验证：
    - 姓名非空
    - 邮箱非空 + 格式校验
    - 密码非空 + ≥ 8 位（前端提示）
  - 错误处理：
    - 409 `email_exists` → "该邮箱已注册"
    - 其他错误 → 显示服务器返回的 message
  - 注册成功 → `register()` 内部自动登录并跳转到 `/`
  - 如果已登录 → `<Navigate to="/" />`
- **验收**：
  - 页面在 `/register` 路径正确渲染 ✅
  - 全部填写正确 → 注册成功，自动登录跳转主页 ✅
  - 重复邮箱 → 显示 "该邮箱已注册"，已填信息保留 ✅
  - 密码 < 8 位 → 前端阻止提交 + 提示 ✅
  - 已登录用户访问 `/register` → 跳转 `/` ✅

---

### T-AUTH-23: ForbiddenPage.tsx 实现

- **依赖**：无
- **文件**：`frontend/src/features/auth/ForbiddenPage.tsx`
- **说明**：
  - 居中显示 403 图标 + "您没有权限访问此页面" 文案
  - "返回首页"按钮 → `<Link to="/">`
  - 简洁、友好的视觉设计（使用 MUI `Alert` 或自定义样式）
- **验收**：
  - 无权限用户访问受限页面 → 显示 403 页面 ✅
  - 页面包含 "返回首页" 链接到 `/` ✅

---

## Phase 5：App.tsx + 侧边栏权限化

> **目标**：App.tsx 路由拆分、AuthGuard 接入、菜单动态渲染  
> **依赖**：Phase 3、Phase 4 全部完成

---

### T-AUTH-24: App.tsx 路由拆分 + AuthGuard 接入

- **依赖**：T-AUTH-19（AuthGuard）、T-AUTH-21（LoginPage）、T-AUTH-22（RegisterPage）、T-AUTH-23（ForbiddenPage）
- **文件**：`frontend/src/App.tsx`
- **说明**：
  - 添加 `import` 引入 `AuthGuard`、`LoginPage`、`RegisterPage`、`ForbiddenPage`
  - 拆分路由配置为三层：
    1. **公开路由**（无需认证）：`/login`、`/register`、`/403`
    2. **需认证路由**（仅需登录）：`/`（Dashboard）、`/signals`、`/demands`、`/reports`
    3. **需认证 + 权限路由**：`/strategy`（需 `schema.read`）
  - 路由结构：
    ```tsx
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/403" element={<ForbiddenPage />} />
      <Route path="/" element={<AuthGuard><MainLayout /></AuthGuard>}>
        <Route index element={<DashboardPage />} />
        <Route path="signals" element={<SignalsPage />} />
        <Route path="demands" element={<DemandsPage />} />
        <Route path="strategy" element={
          <AuthGuard requiredPermissions={["schema.read"]}>
            <StrategyPage />
          </AuthGuard>
        } />
        <Route path="reports" element={<ReportsPage />} />
      </Route>
    </Routes>
    ```
  - 抽取 `MainLayout` 组件（将现有的 AppBar + Drawer + `<Outlet />` 包装）
  - **关键**：`/` 的路由守卫使用 `<AuthGuard>` 包裹 `MainLayout`，不需要额外 `requiredPermissions`
- **验收**：
  - 未登录 → 所有页面跳转 `/login` ✅
  - 已登录 → Dashboard 正常显示 ✅
  - `member` 角色访问 `/strategy` → 跳转 `/403` ✅
  - `ai_engineer_admin` 角色访问 `/strategy` → 正常显示 ✅
  - `/login`、`/register`、`/403` 无论登录与否都可达 ✅

---

### T-AUTH-25: 侧边栏菜单权限动态过滤

- **依赖**：T-AUTH-18（useAuth）、T-AUTH-24（MainLayout 抽取）
- **文件**：`frontend/src/App.tsx`（SidebarNav 组件）
- **说明**：
  - 为每个 `menuItem` 添加 `permission` 字段（null = 所有人可见）：
    ```typescript
    const menuItems = [
      { text: "决策台",       icon: <DashboardIcon />, path: "/",          permission: null },
      { text: "评论信号池",   icon: <SignalsIcon />,    path: "/signals",   permission: "task.read" },
      { text: "需求地图",     icon: <DemandsIcon />,    path: "/demands",   permission: "task.read" },
      { text: "策略 & Agent", icon: <StrategyIcon />,   path: "/strategy",  permission: "schema.read" },
      { text: "报告中心",     icon: <ReportsIcon />,    path: "/reports",   permission: "report.read" },
    ];
    ```
  - 在 `SidebarNav` 组件中调用 `useAuth()` 的 `hasPermission`
  - 过滤逻辑：`menuItems.filter(item => !item.permission || hasPermission(item.permission))`
  - 仅渲染可见菜单项
- **验收**：
  - `super_admin` / `team_admin` → 全部 5 个菜单项可见 ✅
  - `ai_engineer_admin` → 决策台、信号池、需求地图、策略、报告中心 均可见 ✅
  - `member` → 仅决策台、信号池、需求地图、报告中心 可见（策略菜单隐藏）✅
  - 权限变更后菜单实时更新 ✅

---

## Phase 6：种子数据更新 + middleware 接入验证

> **目标**：Demo 用户可正常登录使用  
> **依赖**：Phase 2 全部完成

---

### T-AUTH-26: seed.sql 用户密码哈希更新

- **依赖**：T-AUTH-03（hashPassword）
- **文件**：`backend/db/seed.sql`
- **说明**：
  - 使用 `hashPassword("demo123456")` 生成三个用户的密码哈希
  - 在 seed.sql 中追加 `UPDATE` 语句：
    ```sql
    UPDATE users SET password_hash = '<hash_admin>'    WHERE id = 'user_demo';
    UPDATE users SET password_hash = '<hash_ai_admin>' WHERE id = 'user_ai_admin';
    UPDATE users SET password_hash = '<hash_member>'   WHERE id = 'user_member';
    ```
  - 注意：每个用户应使用不同的 salt（各自调用 hashPassword 一次），即三个不同的 hash 值
  - 或者：运行脚本生成三个固定 salt 的哈希（salt 硬编码到 seed.sql）
- **验收**：
  - 数据库初始化后，`user_demo` 用户存在 password_hash ✅
  - 使用 `demo123456` 密码可登录三个用户各自 ✅
  - 每个用户的 password_hash 不同（不同 salt）✅

---

### T-AUTH-27: 现有业务路由 middleware 接入验证

- **依赖**：T-AUTH-06（权限校验函数改完）、T-AUTH-08（CORS 改完）
- **文件**：`backend/src/server.mjs`
- **说明**：
  - **无需新增代码**。Phase 1 已将 `requirePermission`、`assertTeamAccess`、`filterByTeam` 改为真实实现
  - 现有 handler 已调用这些函数，改造后自动生效（零改动）
  - 验证点：
    - `buildRequestContext` 改为 JWT → 所有 handler 自动获得正确的 context（无需修改 handler）
    - `send()` CORS 改造 → 所有响应自动带上安全头
    - 需确认 `getAuthContext` handler 的响应格式与新 `/api/auth/me` 兼容
  - **若有差异**：更新 `getAuthContext` 的响应字段名以匹配 `handleGetMe` 的格式
- **验收**：
  - 携带合法 JWT 调用 `GET /api/tasks` → 返回当前用户团队的任务列表 ✅
  - `member` 角色调用 `POST /api/tasks` → 403（无 task.write 权限）✅
  - A 团队用户访问 B 团队任务 `GET /api/tasks/b-team-task` → 403 或空结果 ✅
  - `super_admin` 可查看所有团队数据 ✅
  - `GET /api/auth/context` 与 `GET /api/auth/me` 行为一致 ✅

---

## Phase 7：集成测试

> **目标**：端到端验证认证流程  
> **依赖**：Phase 1-6 全部完成

---

### T-AUTH-28: 后端 auth API 独立测试

- **依赖**：Phase 2 全部完成
- **文件**：N/A（手工测试 / curl 脚本）
- **说明**：
  - 启动后端服务（`node backend/src/server.mjs`）
  - 使用 curl 或 Postman 测试全部 7 个 auth API：
    1. `POST /api/auth/login` — 成功 / 失败 / 锁定
    2. `POST /api/auth/register` — 成功 / 冲突 / 验证
    3. `GET /api/auth/me` — 带 Token / 无 Token / 过期 Token
    4. `PUT /api/auth/me` — 更新资料
    5. `PUT /api/auth/me/password` — 正确 / 错误旧密码
    6. `POST /api/auth/refresh` — 成功 / 重用检测
    7. `POST /api/auth/logout` — 登出 + 访问拒绝
  - 限流测试：连续 6 次错误登录 → 429
  - CORS 测试：非白名单 Origin → 请求被拒绝
- **验收**：
  - 7 个 API 全部按预期响应 ✅
  - 错误码与规范一致 ✅
  - Refresh Token 旋转正常 ✅
  - 限流生效 ✅

---

### T-AUTH-29: 前端 auth 组件单元测试

- **依赖**：Phase 3、Phase 4 全部完成
- **文件**：`frontend/src/features/auth/` + `frontend/src/shared/auth/`
- **说明**：
  - 测试 AuthContext 状态流转：
    - 初始状态 → isLoading = true
    - 无 Refresh Token → isLoading = false, isAuthenticated = false
    - 有刷新 Token → 自动恢复登录态
  - 测试 AuthGuard：
    - 未登录 → 跳转 /login
    - 无权限 → 跳转 /403
    - 有权限 → 渲染子组件
  - 测试 LoginPage 表单：
    - 空提交 → 显示验证错误
    - 正确凭据 → 调用 login()
    - 错误凭据 → 显示错误信息
  - 测试 RegisterPage 表单：
    - 密码 < 8 位 → 阻止提交
    - 重复邮箱 → 显示冲突错误
  - 测试 API 拦截器：
    - 设置 Token 后请求携带 Authorization Header
    - 401 自动刷新
    - 刷新失败跳转 /login
- **验收**：
  - 所有测试通过 ✅
  - 关键用户流程覆盖 ✅

---

### T-AUTH-30: 端到端流程验证（手动）

- **依赖**：Phase 1-6 全部完成
- **文件**：N/A
- **说明**：
  - 启动完整系统（后端 + 前端）
  - 执行完整用户旅程：
    1. 打开浏览器 → 自动跳转 `/login`
    2. 点击"注册" → 填写信息 → 注册成功 → 自动登录 → 进入 Dashboard
    3. 以 member 角色登录 → 侧边栏仅显示 4 个菜单项 → 点击 `/strategy` → 403
    4. 以 super_admin 角色登录 → 全部菜单可见 → 访问所有页面
    5. 创建任务 → 仅本团队可见（用另一团队用户验证不可见）
    6. 修改密码 → 用新密码重新登录成功
    7. 登出 → Token 失效 → 刷新页面 → 跳转登录
    8. 15 分钟后 Access Token 过期 → API 调用自动刷新 → 无感知
    9. 连续 5 次错误登录 → 锁定 15 分钟
  - 测试不同角色下的权限控制：
    - super_admin：全部可操作
    - team_admin：可管理团队、编辑任务、查看成本
    - ai_engineer_admin：可管理 AI 配置、查看数据
    - member：仅只读查看
- **验收**：
  - 9 个端到端场景全部通过 ✅
  - 4 种角色权限均与控制矩阵一致 ✅
  - 无 UI 崩溃、无控制台红色错误 ✅

---

### T-AUTH-31: 回归测试（现有功能不受影响）

- **依赖**：Phase 1-6 全部完成
- **文件**：N/A
- **说明**：
  - 验证所有现有功能在 auth 接入后不受影响：
    - 任务列表查看 / 创建 / 状态切换
    - 评论信号解析
    - AI Run 触发 / 重试 / 反馈
    - Schema / Prompt 管理
    - Model Gateway 配置
    - 报告生成 / 导出 / 下载
    - 成本 / 质量摘要
    - 审计日志
    - 健康检查
  - 确认所有 handler 在引入 `requirePermission` / `assertTeamAccess` 后仍正常运行
- **验收**：
  - 所有现有功能以 super_admin 角色正常使用 ✅
  - 所有现有功能以 member 角色正确处理权限拒绝 ✅
  - 数据库无脏数据 ✅
  - 无新增控制台错误或警告 ✅

---

## 任务汇总

| Phase | 任务数 | 文件数（新增/修改） | 预估复杂度 |
|-------|--------|-------------------|-----------|
| Phase 1 | 7 (T-AUTH-01 ~ 07) | 1 修改 | 高 |
| Phase 2 | 9 (T-AUTH-08 ~ 16) | 1 修改 | 高 |
| Phase 3 | 4 (T-AUTH-17 ~ 20) | 3 新增 + 2 修改 | 中 |
| Phase 4 | 3 (T-AUTH-21 ~ 23) | 3 新增 | 中 |
| Phase 5 | 2 (T-AUTH-24 ~ 25) | 1 修改 | 中 |
| Phase 6 | 2 (T-AUTH-26 ~ 27) | 1 修改 | 低 |
| Phase 7 | 4 (T-AUTH-28 ~ 31) | 0 | 中 |
| **合计** | **31** | **7 新增 + 6 修改** | |

---

## 执行建议

1. **Phase 1 → Phase 2 必须串行**：后端 auth.mjs 是 server.mjs 的前置依赖
2. **Phase 2 之后可并行 Phase 3 + Phase 6**：
   - 前端开发（Phase 3/4/5）和后端种子数据（Phase 6）互不依赖
   - 但 Phase 3 依赖 Phase 2 的 API 就绪
3. **Phase 4 依赖 Phase 3**：需要 useAuth hook 可用
4. **Phase 5 依赖 Phase 3 + Phase 4**：需要 AuthGuard + 各页面组件
5. **Phase 7 在所有代码改动完成后执行**

### 关键风险点

| 风险 | 缓解措施 |
|------|---------|
| `crypto.scryptSync` 性能 | scrypt 参数（N=16384）经过调优，每次哈希约 100ms，登录场景可接受 |
| JWT 自实现安全性 | 使用 `crypto.timingSafeEqual` 防时序攻击，签名验证逻辑标准，已参考 RFC 7519 |
| Token 黑名单内存泄漏 | `cleanupBlacklist()` 在每次 refresh 时清理过期条目，额外 5 分钟定时清理 |
| CORS 改造影响现有前端 | 添加 `credentials: "include"` + `Authorization` Header，开发环境保留 x-user-id 降级 |
| seed.sql 密码哈希硬编码 | 使用脚本生成固定 salt 的哈希值写入 seed.sql，非运行时生成 |
