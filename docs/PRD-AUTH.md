# Vocos 登录认证与权限管理 PRD

> **版本**：v1.0  
> **作者**：许清楚（产品经理）  
> **日期**：2026-06-06  
> **状态**：草案  
> **依赖**：无外部依赖，纯增量需求

---

## 目录

1. [需求背景与目标](#1-需求背景与目标)
2. [用户故事](#2-用户故事)
3. [角色-权限矩阵](#3-角色-权限矩阵)
4. [功能清单（P0/P1/P2）](#4-功能清单p0p1p2)
5. [页面流程图](#5-页面流程图)
6. [API 接口清单](#6-api-接口清单)
7. [JWT Token 设计](#7-jwt-token-设计)
8. [安全原则](#8-安全原则)
9. [前端路由守卫设计](#9-前端路由守卫设计)
10. [数据库变更](#10-数据库变更)
11. [待确认问题](#11-待确认问题)

---

## 1. 需求背景与目标

### 1.1 当前痛点

Vocos 系统目前已部署到 https://vocosai.com，但认证体系处于 Demo 桩状态：

| 组件 | 当前状态 | 问题 |
|------|---------|------|
| 后端 `auth.mjs`（56行） | `buildRequestContext()` 从 Header `x-user-id`/`x-team-id` 读身份，缺省回退 `user_demo`/`team_demo` | 无任何真实认证，Header 可被伪造 |
| `requirePermission()` | 空函数，不做任何校验 | 所有用户拥有全部权限 |
| `assertTeamAccess()` | 空函数，不做团队隔离 | 用户可访问任意团队数据 |
| `filterByTeam()` | 直接返回全部记录 | 无数据隔离 |
| 前端 | 零认证页面，无登录/注册/忘记密码/用户设置 | 任何人打开即用，无身份概念 |
| DB Schema | 已预留 `users`/`teams`/`team_members` 表，含角色枚举 | 结构完备但未与认证逻辑打通 |
| 种子数据 | 3 个 demo 用户（admin@vocos.local / ai@vocos.local / member@vocos.local） | 无密码哈希，仅用作 Demo |

**核心风险**：
- 任何人可通过修改 HTTP Header 冒充任意用户
- 团队间数据零隔离，A 团队可查看/修改 B 团队任务
- 无登录态，浏览器关闭后需手动重新设置 Header
- 无法区分真实用户身份，审计日志不可信

### 1.2 需求范围

| 功能 | 说明 |
|------|------|
| 用户登录 | 邮箱 + 密码登录，签发 JWT Access Token + Refresh Token |
| 用户注册 | 邮箱 + 密码 + 姓名注册，默认 member 角色，需绑定团队 |
| 权限分级 | 四级角色：super_admin / team_admin / ai_engineer_admin / member |
| 团队隔离 | 用户只能查看和操作所属团队的数据 |
| 前端认证页 | 登录页、注册页、用户设置页（修改密码、完善资料） |
| 路由守卫 | 未登录用户自动跳转登录页；无权页面显示 403 |
| Token 管理 | Access Token 短期有效（15min），Refresh Token 长期（7d），自动刷新 |

### 1.3 非目标（本期不做）

- SSO / OAuth 第三方登录（如 Google、微信）
- 多因素认证（MFA）
- 密码强度策略（本期仅长度≥8）
- 邮箱验证（注册即激活）
- 邀请制注册（开放注册）
- 组织架构层级（仅平级团队）
- 密码重置邮件流程（本期不做忘记密码，后期 P2）

---

## 2. 用户故事

### US-1：用户登录

**As a** Vocos 已注册用户  
**I want** 使用邮箱和密码登录系统  
**So that** 我可以安全地访问我的团队数据和功能

**验收标准**：
- 输入邮箱 + 密码，点击登录
- 验证通过后返回 JWT Access Token（15min 有效）和 Refresh Token（7d 有效）
- Access Token 存储在内存（不持久化），Refresh Token 存储在 httpOnly cookie
- 登录成功后跳转到主界面（Dashboard）
- 登录失败显示错误提示（"邮箱或密码错误"）
- 连续 5 次登录失败后锁定账户 15 分钟

### US-2：新用户注册

**As a** 首次使用的品牌运营人员  
**I want** 使用邮箱和姓名注册账号  
**So that** 我可以加入我的团队开始使用 Vocos

**验收标准**：
- 填写姓名、邮箱、密码（≥8 位）
- 选择或输入邀请码绑定已有团队；若无邀请码，创建新团队
- 注册成功后自动创建用户（member 角色）和团队关联
- 注册成功后自动登录并跳转主界面
- 邮箱唯一性校验：重复邮箱提示"该邮箱已注册"
- 注册失败回显已填信息（密码除外）

### US-3：角色权限控制

**As a** 系统管理员  
**I want** 不同角色的用户看到不同的功能模块  
**So that** AI 工程师只能管理 AI 配置，普通成员只能查看数据，核心管理功能不被误操作

**验收标准**：
- super_admin：所有页面和操作可见可用
- team_admin：可管理本团队成员、查看所有数据、编辑任务和报告
- ai_engineer_admin：可查看数据、管理 AI Prompts/Schemas/模型配置
- member：仅可查看决策台、信号池、报告（只读），无编辑权限
- 前端菜单根据角色动态渲染（无权限的菜单项不显示）
- API 层面二次校验（前端隐藏 + 后端拒绝）

### US-4：团队数据隔离

**As a** 某团队成员  
**I want** 我只能看到自己团队的任务、报告、AI 运行记录  
**So that** 多团队共用系统时数据不会泄露

**验收标准**：
- 所有 API 查询默认按 `context.teamId` 过滤
- `super_admin` 可选择查看所有团队数据（查询参数 `all_teams=true`）
- 直接通过 ID 访问其他团队资源返回 403
- 任务、报告、AI 运行、评论、审计日志全部受团队隔离保护

### US-5：用户设置

**As a** 已登录用户  
**I want** 修改我的密码和完善个人资料  
**So that** 我可以保持账户安全并且信息准确

**验收标准**：
- 个人资料页：显示并可编辑姓名、手机号、头像 URL
- 修改密码：需输入旧密码 + 新密码（≥8 位）+ 确认新密码
- 修改密码或资料后重新签发 Token（旧 Token 失效）
- 头像支持 URL 输入（本期不做文件上传）

---

## 3. 角色-权限矩阵

### 3.1 权限清单（17 项）

基于现有 `auth.mjs` 中 `PERMISSIONS` 枚举扩展，新增 `TEAM_MANAGE` 和 `USER_MANAGE`：

| # | 权限 Key | 权限名称 | 说明 |
|---|----------|---------|------|
| 1 | `task.read` | 任务读取 | 查看任务列表和详情 |
| 2 | `task.write` | 任务写入 | 创建/编辑任务、上传评论、启动分析 |
| 3 | `ai_run.read` | AI 运行读取 | 查看 AI 执行记录和结果 |
| 4 | `ai_run.write` | AI 运行写入 | 重试/手动触发 AI 运行 |
| 5 | `report.read` | 报告读取 | 查看和下载报告 |
| 6 | `report.write` | 报告写入 | 生成和导出报告 |
| 7 | `cost.read` | 成本读取 | 查看成本统计和技能指标 |
| 8 | `quality.read` | 质量读取 | 查看质量评分和反馈 |
| 9 | `audit.read` | 审计读取 | 查看审计日志和存储诊断 |
| 10 | `schema.read` | Schema 读取 | 查看 AI 输出 Schema |
| 11 | `schema.write` | Schema 写入 | 创建/编辑 AI 输出 Schema |
| 12 | `prompt.read` | Prompt 读取 | 查看 AI Prompt 模板 |
| 13 | `prompt.write` | Prompt 写入 | 创建/编辑/激活 Prompt 版本 |
| 14 | `model.read` | 模型读取 | 查看模型路由和提供商 |
| 15 | `model.write` | 模型写入 | 管理 API Key、测试连接 |
| 16 | `team.manage` | 团队管理 | 管理团队成员（增删改角色） |
| 17 | `user.manage` | 用户管理 | 管理所有用户（仅 super_admin） |

### 3.2 角色-权限矩阵

| 权限 | super_admin | team_admin | ai_engineer_admin | member |
|------|:-----------:|:----------:|:-----------------:|:------:|
| `task.read` | ✅ | ✅ | ✅ | ✅ |
| `task.write` | ✅ | ✅ | ❌ | ❌ |
| `ai_run.read` | ✅ | ✅ | ✅ | ✅ |
| `ai_run.write` | ✅ | ✅ | ✅ | ❌ |
| `report.read` | ✅ | ✅ | ✅ | ✅ |
| `report.write` | ✅ | ✅ | ❌ | ❌ |
| `cost.read` | ✅ | ✅ | ❌ | ❌ |
| `quality.read` | ✅ | ✅ | ✅ | ❌ |
| `audit.read` | ✅ | ✅ | ❌ | ❌ |
| `schema.read` | ✅ | ✅ | ✅ | ❌ |
| `schema.write` | ✅ | ❌ | ✅ | ❌ |
| `prompt.read` | ✅ | ✅ | ✅ | ❌ |
| `prompt.write` | ✅ | ❌ | ✅ | ❌ |
| `model.read` | ✅ | ✅ | ✅ | ❌ |
| `model.write` | ✅ | ❌ | ✅ | ❌ |
| `team.manage` | ✅ | ✅ | ❌ | ❌ |
| `user.manage` | ✅ | ❌ | ❌ | ❌ |

### 3.3 角色定义

| 角色 | 核心职责 | 典型用户 |
|------|---------|---------|
| **super_admin** | 系统全局管理，全权限 | 平台管理员、技术负责人 |
| **team_admin** | 团队管理 + 业务操作 | 项目经理、品牌运营负责人 |
| **ai_engineer_admin** | AI 配置管理 + 数据查看 | Prompt 工程师、AI 配置管理员 |
| **member** | 只读查看 | 内容团队、客户 |

### 3.4 与现有角色枚举的差异

**现行 DB 角色枚举**：`super_admin` / `ai_engineer_admin` / `member`

**新增**：`team_admin`

**变更**：`ai_engineer_admin` 从"可见全部权限的 Demo 模式"收窄为"AI 配置管理 + 数据只读"。

**迁移策略**：
- 种子数据中 `ai_engineer_admin` 用户（ai@vocos.local）按新权限矩阵自动约束
- 新增 `team_admin` 角色，种子数据中默认不创建（等待第一个注册团队时自动赋予创建者）

---

## 4. 功能清单（P0/P1/P2）

### 4.1 P0 — 必须交付（MVP）

| # | 功能 | 说明 | 涉及模块 |
|---|------|------|---------|
| P0-1 | 邮箱 + 密码登录 | JWT 签发，Access Token + Refresh Token | 后端 API + 前端页面 |
| P0-2 | JWT 认证中间件 | 解析 Token，注入 `context`（userId/teamId/role/permissions） | 后端 `auth.mjs` |
| P0-3 | 权限校验实现 | `requirePermission()` 根据 context.permissions 校验 | 后端 `auth.mjs` |
| P0-4 | 团队隔离实现 | `assertTeamAccess()` / `filterByTeam()` 真实过滤 | 后端 `auth.mjs` |
| P0-5 | 前端登录页 | 邮箱 + 密码表单，登录/注册切换 | 前端 `LoginPage.tsx` |
| P0-6 | 前端注册页 | 姓名 + 邮箱 + 密码 + 团队绑定 | 前端 `RegisterPage.tsx` |
| P0-7 | 路由守卫 | 未登录跳转 `/login`，登录态存储与恢复 | 前端 `AuthGuard.tsx` |
| P0-8 | Token 自动刷新 | 401 时自动用 Refresh Token 换新 Access Token | 前端 `api.ts` |

### 4.2 P1 — 应该交付

| # | 功能 | 说明 | 涉及模块 |
|---|------|------|---------|
| P1-1 | 用户设置页 | 修改密码、完善资料（姓名/手机/头像 URL） | 前端 + 后端 |
| P1-2 | 登录失败锁定 | 连续 5 次失败锁定 15 分钟 | 后端 |
| P1-3 | 登出 | 清除 Token，回到登录页 | 前端 + 后端 |
| P1-4 | 角色动态菜单 | 前端菜单根据角色权限渲染 | 前端 App.tsx |
| P1-5 | 403 页面 | 无权访问时显示友好提示 | 前端 |
| P1-6 | 种子数据修整 | 为 demo 用户添加 bcrypt 密码哈希 | 后端 `seed.sql` |

### 4.3 P2 — 建议交付

| # | 功能 | 说明 | 涉及模块 |
|---|------|------|---------|
| P2-1 | 忘记密码 | 邮箱重置密码流程 | 后端 + 前端 + 邮件服务 |
| P2-2 | 邮箱验证 | 注册时验证邮箱所有权 | 后端 + 邮件服务 |
| P2-3 | 密码强度校验 | 复杂度要求（大小写+数字+特殊字符） | 前端 + 后端 |
| P2-4 | 登录设备管理 | 查看/撤销活跃会话 | 后端 + 前端 |
| P2-5 | 操作日志增强 | 记录登入/登出/密码修改到审计日志 | 后端 |
| P2-6 | 邀请制注册 | 团队管理员生成邀请链接 | 后端 + 前端 |

---

## 5. 页面流程图

### 5.1 页面流转

```
                    ┌──────────────┐
                    │  浏览器打开    │
                    │  VOCOS URL    │
                    └──────┬───────┘
                           │
                           ▼
                  ┌────────────────┐
                  │   路由守卫检查   │
                  │  有有效Token？   │
                  └───┬────────┬───┘
                      │        │
                   是 │        │ 否
                      │        │
                      ▼        ▼
              ┌──────────┐  ┌──────────────┐
              │  主界面    │  │   登录页       │
              │ Dashboard │  │  /login       │
              └─────┬────┘  └───┬──────┬────┘
                    │            │      │
                    │            │      │ 点击"注册"
                    │            │      ▼
                    │            │  ┌──────────────┐
                    │            │  │   注册页       │
                    │            │  │  /register    │
                    │            │  └───────┬──────┘
                    │            │          │
                    │            │          │ 注册成功
                    │            │          │ 自动登录
                    │            │          │
                    │            ▼          ▼
                    │       ┌──────────────────┐
                    │       │    主界面          │
                    │       │  Dashboard/       │
                    │       │  Signals/         │
                    │       │  Demands/         │
                    │       │  Strategy/        │
                    │       │  Reports          │
                    │       └────────┬─────────┘
                    │                │
                    │                │ 点击用户头像
                    │                ▼
                    │       ┌──────────────────┐
                    │       │   用户设置         │
                    │       │  /settings        │
                    │       │  ├─ 个人资料       │
                    │       │  └─ 修改密码       │
                    │       └────────┬─────────┘
                    │                │
                    │                │ 点击登出
                    │                ▼
                    │       ┌──────────────────┐
                    └───────│   登录页           │
                            │  清除Token         │
                            └──────────────────┘

    无权限访问 ──► 403 页面 "您没有权限访问此页面"
```

### 5.2 登录页布局

```
┌──────────────────────────────────────────────────┐
│                                                  │
│              [VOCOS Logo]                        │
│         Voice of Consumer OS                     │
│                                                  │
│     ┌────────────────────────────┐               │
│     │  邮箱                        │               │
│     │  ┌────────────────────────┐ │               │
│     │  │ admin@vocos.local      │ │               │
│     │  └────────────────────────┘ │               │
│     │                              │               │
│     │  密码                        │               │
│     │  ┌────────────────────────┐ │               │
│     │  │ ●●●●●●●●      [👁]     │ │               │
│     │  └────────────────────────┘ │               │
│     │                              │               │
│     │  [✓] 记住我                  │               │
│     │                              │               │
│     │  ┌────────────────────────┐ │               │
│     │  │        登  录           │ │               │
│     │  └────────────────────────┘ │               │
│     │                              │               │
│     │  还没有账号？立即注册 →       │               │
│     └────────────────────────────┘               │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 5.3 注册页布局

```
┌──────────────────────────────────────────────────┐
│                                                  │
│              [VOCOS Logo]                        │
│            创建您的账号                            │
│                                                  │
│     ┌────────────────────────────┐               │
│     │  姓名                        │               │
│     │  ┌────────────────────────┐ │               │
│     │  │ 张三                    │ │               │
│     │  └────────────────────────┘ │               │
│     │                              │               │
│     │  邮箱                        │               │
│     │  ┌────────────────────────┐ │               │
│     │  │ zhang@example.com      │ │               │
│     │  └────────────────────────┘ │               │
│     │                              │               │
│     │  密码（至少8位）              │               │
│     │  ┌────────────────────────┐ │               │
│     │  │ ●●●●●●●●               │ │               │
│     │  └────────────────────────┘ │               │
│     │                              │               │
│     │  团队（可选）                 │               │
│     │  ┌────────────────────────┐ │               │
│     │  │ 输入邀请码或创建新团队    │ │               │
│     │  └────────────────────────┘ │               │
│     │                              │               │
│     │  ┌────────────────────────┐ │               │
│     │  │        注  册           │ │               │
│     │  └────────────────────────┘ │               │
│     │                              │               │
│     │  已有账号？返回登录 →         │               │
│     └────────────────────────────┘               │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## 6. API 接口清单

### 6.1 认证接口

| 方法 | 路径 | 说明 | 鉴权 | 请求体 | 响应 |
|------|------|------|------|--------|------|
| POST | `/api/auth/login` | 用户登录 | 无 | `{ email, password }` | `{ accessToken, user }` + Set-Cookie: refreshToken |
| POST | `/api/auth/register` | 用户注册 | 无 | `{ name, email, password, teamName?, inviteCode? }` | `{ accessToken, user }` + Set-Cookie: refreshToken |
| POST | `/api/auth/logout` | 登出 | Bearer Token | 无 | `{ ok: true }` + Clear-Cookie |
| POST | `/api/auth/refresh` | 刷新 Token | Cookie (refreshToken) | 无 | `{ accessToken }` + Set-Cookie: newRefreshToken |
| GET | `/api/auth/me` | 获取当前用户信息 | Bearer Token | 无 | `{ user, team, permissions }` |
| PUT | `/api/auth/me` | 更新个人资料 | Bearer Token | `{ name?, phone?, avatarUrl? }` | `{ user }` |
| PUT | `/api/auth/me/password` | 修改密码 | Bearer Token | `{ oldPassword, newPassword }` | `{ ok: true }` |

### 6.2 团队管理接口

| 方法 | 路径 | 说明 | 鉴权 | 权限 |
|------|------|------|------|------|
| GET | `/api/teams/:id/members` | 查看团队成员列表 | Bearer Token | `team.manage` |
| POST | `/api/teams/:id/members` | 添加团队成员 | Bearer Token | `team.manage` |
| PUT | `/api/teams/:id/members/:memberId` | 修改成员角色 | Bearer Token | `team.manage` |
| DELETE | `/api/teams/:id/members/:memberId` | 移除团队成员 | Bearer Token | `team.manage` |

### 6.3 现有接口变更

所有现有 API 路由支持 Bearer Token 鉴权（代替 `x-user-id` / `x-team-id` Header）：

| 变更项 | 说明 |
|--------|------|
| 鉴权方式 | 从 `x-user-id` / `x-team-id` Header → `Authorization: Bearer <token>` |
| `buildRequestContext()` | 从 JWT payload 解析 userId / teamId / role / permissions |
| `requirePermission()` | 实际校验 context.permissions 中是否包含所需权限 |
| `assertTeamAccess()` | 实际校验 context.teamId 是否匹配资源团队 |
| `filterByTeam()` | 实际按 context.teamId 过滤记录（super_admin 除外） |
| 兼容性 | 开发环境保留 `x-user-id` Header 降级（`NODE_ENV=development` 时可用） |

### 6.4 错误码

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | `bad_request` | 请求参数校验失败 |
| 401 | `unauthorized` | Token 无效或已过期 |
| 401 | `invalid_credentials` | 邮箱或密码错误 |
| 403 | `forbidden` | 无权限访问该资源 |
| 403 | `not_team_member` | 不在目标团队中 |
| 404 | `not_found` | 资源不存在 |
| 409 | `email_exists` | 邮箱已被注册 |
| 429 | `too_many_attempts` | 登录尝试次数过多 |

---

## 7. JWT Token 设计

### 7.1 Token 类型

| 类型 | 存储位置 | 有效期 | 用途 |
|------|---------|--------|------|
| Access Token | 前端内存（变量） | 15 分钟 | 所有 API 请求鉴权 |
| Refresh Token | httpOnly Secure Cookie | 7 天 | 刷新 Access Token |
| Refresh Token Family | 后端 DB/内存 | 7 天 | 检测 Refresh Token 重用（防重放） |

### 7.2 JWT Payload（Access Token）

```json
{
  "sub": "user_demo",
  "email": "admin@vocos.local",
  "name": "Demo Admin",
  "role": "super_admin",
  "team_id": "team_demo",
  "team_name": "Vocos Demo Team",
  "permissions": [
    "task.read", "task.write",
    "ai_run.read", "ai_run.write",
    "report.read", "report.write",
    "cost.read", "quality.read",
    "audit.read",
    "schema.read", "schema.write",
    "prompt.read", "prompt.write",
    "model.read", "model.write",
    "team.manage", "user.manage"
  ],
  "iat": 1717603200,
  "exp": 1717604100,
  "jti": "unique-token-id-abc123"
}
```

| 字段 | 说明 |
|------|------|
| `sub` | 用户 ID |
| `email` | 用户邮箱 |
| `name` | 用户姓名 |
| `role` | 角色（super_admin / team_admin / ai_engineer_admin / member） |
| `team_id` | 默认团队 ID |
| `team_name` | 团队名称（仅展示用） |
| `permissions` | 权限列表（从 role + DB 映射生成） |
| `iat` | 签发时间（unix timestamp） |
| `exp` | 过期时间（iat + 900s） |
| `jti` | Token 唯一 ID（用于撤销） |

### 7.3 JWT Payload（Refresh Token）

```json
{
  "sub": "user_demo",
  "jti": "refresh-token-id-xyz789",
  "family": "token-family-uuid",
  "iat": 1717603200,
  "exp": 1718208000
}
```

| 字段 | 说明 |
|------|------|
| `sub` | 用户 ID |
| `jti` | Token 唯一 ID |
| `family` | Token 族 ID（所有刷新出来的 Token 共享，用于检测重用） |
| `iat` | 签发时间 |
| `exp` | 过期时间（iat + 604800s，7 天） |

### 7.4 Token 刷新流程

```
用户请求 API
    │
    ▼
API 返回 401（Access Token 过期）
    │
    ▼
前端拦截器自动调用 POST /api/auth/refresh
    │
    ├── Refresh Token 有效
    │   ├── 签发新 Access Token + 新 Refresh Token
    │   ├── 旧 Refresh Token 加入黑名单（旋转策略）
    │   └── 重试原请求
    │
    └── Refresh Token 无效/过期/被撤销
        └── 跳转登录页
```

### 7.5 Refresh Token 旋转策略（防重放）

每次刷新时：
1. 旧 Refresh Token 标记为已使用（失效）
2. 签发新 Refresh Token（新 `jti`，同 `family`）
3. 若发现已使用的 Refresh Token 被再次使用 → 该 `family` 全部失效 → 用户需重新登录

### 7.6 签名算法

- 算法：HS256（HMAC-SHA256）
- 密钥：环境变量 `JWT_SECRET`（≥32 字符随机字符串）
- 开发环境默认值：`vocos-dev-secret-change-in-production`
- 生产环境：通过 `VOCOS_JWT_SECRET` 注入，严禁硬编码

---

## 8. 安全原则

### 8.1 密码安全

| 策略 | 实现 |
|------|------|
| 哈希算法 | bcrypt（cost factor = 12） |
| 存储 | `users.password_hash` 列只存 bcrypt 哈希，永不存明文 |
| 传输 | 密码仅通过 HTTPS 传输，不在 URL query 中出现 |
| 比较 | 使用恒定时间比较（bcrypt.compare）防止时序攻击 |
| 旧密码 | 修改密码时需验证旧密码 |
| 种子数据 | Demo 用户密码统一为 `demo123456`，写入 bcrypt 哈希 |

### 8.2 Token 传输与存储

| Token 类型 | 传输方式 | 存储位置 | 说明 |
|-----------|---------|---------|------|
| Access Token | `Authorization: Bearer <token>` Header | 前端内存（JavaScript 变量） | 不持久化，页面刷新后通过 Refresh Token 重新获取 |
| Refresh Token | httpOnly Secure SameSite=Strict Cookie | 浏览器 Cookie（不可 JS 访问） | 防止 XSS 窃取，CSRF 由 SameSite 防护 |

**为什么选 "Bearer Header + httpOnly Cookie" 混合方案**：
- Bearer Header：通用性好，所有 HTTP 客户端兼容，前端 fetch 自然支持
- httpOnly Cookie（Refresh Token）：防 XSS 窃取，Refresh Token 比 Access Token 价值更高（有效期长）
- 不用纯 Cookie 方案：SPA + Cookie 的 CSRF 防护复杂，Bearer Header 天然免疫 CSRF
- 不用纯 Header 方案：Refresh Token 持久化到 localStorage 有 XSS 泄露风险

### 8.3 CORS 限制

```javascript
// 当前：access-control-allow-origin: *（不安全）
// 改进后：
const ALLOWED_ORIGINS = [
  "https://vocosai.com",
  "http://localhost:5173",     // Vite dev server
  "http://127.0.0.1:3000"      // 本地部署
];

// OPTIONS 预检请求
Access-Control-Allow-Origin: <请求 origin 的精确匹配>
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
```

### 8.4 其他安全措施

| 措施 | 说明 |
|------|------|
| 请求限流 | 登录接口：5 次/分钟/IP；注册接口：3 次/分钟/IP |
| Token 黑名单 | 登出时 Access Token 加入内存黑名单（有效期 15 分钟，与 Token 时长一致） |
| 密码长度 | 注册/修改密码 ≥ 8 位 |
| 邮箱规范化 | 去空格 + 小写化后再存储和比较 |
| 敏感信息 | 错误响应不泄露具体原因（区分"用户不存在"和"密码错误"——统一"邮箱或密码错误"） |
| 安全 Header | 添加 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY` |

---

## 9. 前端路由守卫设计

### 9.1 目录结构

```
frontend/src/
├── features/
│   └── auth/
│       ├── LoginPage.tsx          # 登录页
│       ├── RegisterPage.tsx       # 注册页
│       └── SettingsPage.tsx       # 用户设置页
├── shared/
│   ├── auth/
│   │   ├── AuthContext.tsx        # 认证上下文 Provider
│   │   ├── AuthGuard.tsx          # 路由守卫组件
│   │   └── useAuth.ts            # 认证 Hook
│   └── services/
│       └── api.ts                 # API 客户端（添加 Token 注入 + 刷新逻辑）
└── App.tsx                        # 路由配置（添加认证路由）
```

### 9.2 AuthContext 设计

```typescript
// AuthContext.tsx — 认证状态管理
interface AuthState {
  user: User | null;           // 当前用户信息
  team: Team | null;           // 当前团队信息
  permissions: string[];       // 权限列表
  accessToken: string | null;  // Access Token（内存）
  isAuthenticated: boolean;    // 是否已认证
  isLoading: boolean;          // 初始加载中（检查 Refresh Token）
}

// 初始化流程：
// 1. AuthProvider 挂载时调用 GET /api/auth/me
//     - 如有有效 Cookie（Refresh Token）→ 自动刷新 Access Token → 设置认证状态
//     - 如无 Cookie → 设置 isAuthenticated = false
// 2. isLoading = true 期间显示全屏 Loading
// 3. isLoading = false 后渲染子组件（路由守卫生效）
```

### 9.3 AuthGuard 组件

```typescript
// AuthGuard.tsx — 路由守卫
function AuthGuard({ children, requiredPermissions = [] }) {
  const { isAuthenticated, isLoading, permissions } = useAuth();

  // 加载中：显示 Loading
  if (isLoading) return <FullScreenLoader />;

  // 未登录：跳转登录页
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // 权限校验：缺少任意一个权限 → 403
  const hasAllPermissions = requiredPermissions.every(p => permissions.includes(p));
  if (!hasAllPermissions) return <ForbiddenPage />;

  return children;
}
```

### 9.4 App.tsx 路由配置

```typescript
// 新路由结构
<Routes>
  {/* 公开路由 */}
  <Route path="/login" element={<LoginPage />} />
  <Route path="/register" element={<RegisterPage />} />

  {/* 需认证路由 */}
  <Route path="/settings" element={
    <AuthGuard><SettingsPage /></AuthGuard>
  } />

  {/* 主界面（需认证） */}
  <Route path="/" element={
    <AuthGuard>
      <MainLayout />
    </AuthGuard>
  }>
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

  {/* 403 */}
  <Route path="/403" element={<ForbiddenPage />} />
</Routes>
```

### 9.5 API 拦截器（Token 注入 + 自动刷新）

```typescript
// api.ts — 改造后的 API 客户端
let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...headers, ...opts?.headers } });

  // 401 → 尝试刷新 Token
  if (res.status === 401 && !path.includes("/auth/refresh")) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      // 重试原请求
      headers["Authorization"] = `Bearer ${newToken}`;
      return fetch(`${BASE}${path}`, { ...opts, headers: { ...headers, ...opts?.headers } }).then(handleResponse);
    }
    // 刷新失败 → 跳转登录
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  return handleResponse(res);
}

async function refreshAccessToken(): Promise<string | null> {
  // 防止并发刷新
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include", // 发送 Cookie
        headers: { "Content-Type": "application/json" }
      });
      if (!res.ok) return null;
      const data = await res.json();
      setAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
```

### 9.6 侧边栏菜单动态渲染

```typescript
// 根据角色权限动态显示菜单项
const menuItems = [
  { text: "决策台", icon: <DashboardIcon />, path: "/", permission: null },
  { text: "评论信号池", icon: <SignalsIcon />, path: "/signals", permission: "task.read" },
  { text: "需求地图", icon: <DemandsIcon />, path: "/demands", permission: "task.read" },
  { text: "策略 & Agent", icon: <StrategyIcon />, path: "/strategy", permission: "schema.read" },
  { text: "报告中心", icon: <ReportsIcon />, path: "/reports", permission: "report.read" },
];

// 侧边栏渲染时过滤无权限菜单
const visibleItems = menuItems.filter(item =>
  !item.permission || permissions.includes(item.permission)
);
```

---

## 10. 数据库变更

### 10.1 users 表变更

无结构变更，字段已完备。仅需种子数据更新：

```sql
-- 为 demo 用户添加 bcrypt 密码哈希（密码：demo123456）
UPDATE users SET password_hash = '$2b$12$...bcrypt_hash...' WHERE id IN ('user_demo', 'user_ai_admin', 'user_member');
```

### 10.2 team_members 表

`role` 字段现有枚举需要扩展，新增 `team_admin`：

```sql
-- role 字段允许值（非 DB 约束，由应用层校验）：
-- super_admin | team_admin | ai_engineer_admin | member
```

### 10.3 新增表（Token 管理）

如需支持 Token 黑名单持久化（服务重启后保留），新增表：

```sql
CREATE TABLE token_blacklist (
    jti TEXT PRIMARY KEY,           -- Token JTI
    family TEXT NOT NULL,           -- Token 族 ID
    expires_at TEXT NOT NULL,       -- 过期时间（之后可清理）
    created_at TEXT NOT NULL
);

CREATE INDEX idx_token_blacklist_expires ON token_blacklist(expires_at);
```

### 10.4 种子数据变更

```sql
-- 用户表：添加 password_hash
UPDATE users SET password_hash = '<bcrypt_hash_of_demo123456>'
WHERE id IN ('user_demo', 'user_ai_admin', 'user_member');

-- 团队成员：user_demo 角色改为 super_admin（保持不变）
-- user_ai_admin 保持 ai_engineer_admin
-- user_member 保持 member
-- 当前种子数据已正确，无需修改
```

---

## 11. 待确认问题

### 11.1 需要产品决策

| # | 问题 | 选项 | 影响 |
|---|------|------|------|
| Q1 | **注册方式**：开放注册还是邀请制？ | A) 开放：任何人可注册，自动创建团队<br>B) 邀请：管理员发链接，用户通过链接加入现有团队 | 若选 B，需增加邀请码生成/校验接口 |
| Q2 | **多团队支持**：一个用户能否属于多个团队？ | A) 单团队：一个用户只属于一个团队（当前设计）<br>B) 多团队：用户可加入多个团队，切换使用 | 若选 B，需增加团队切换 UI 和 Token 重签逻辑 |
| Q3 | **Refresh Token 存储**：服务重启后是否保留登录态？ | A) 内存存储：重启后全部登出（当前设计，简单）<br>B) DB 持久化：`token_blacklist` 表存黑名单，重启后复用 | 若选 B，增加开发量但用户体验更好 |
| Q4 | **JWT 签名算法**：HS256 还是 RS256？ | A) HS256：对称密钥，简单，适合单服务<br>B) RS256：非对称，支持多服务间验证（未来微服务） | 当前单服务选 A；若规划微服务选 B |
| Q5 | **Access Token 过期时间**：15 分钟是否合适？ | A) 5 分钟（更安全，刷新频繁）<br>B) 15 分钟（当前设计）<br>C) 30 分钟（体验更好，安全略降） | 需平衡安全性和 API 调用频率 |

### 11.2 需要技术对齐

| # | 问题 | 说明 |
|---|------|------|
| Q6 | **现有 routes 兼容**：开发环境是否保留 `x-user-id` Header 降级？ | 建议保留，方便本地开发和调试，生产环境禁用 |
| Q7 | **JWT 密钥管理**：`JWT_SECRET` 如何注入？ | Docker 环境变量 `VOCOS_JWT_SECRET`，开发环境默认值 |
| Q8 | **bcrypt 依赖**：Node.js 后端使用 `bcryptjs`（纯 JS）还是 `bcrypt`（native）？ | `bcryptjs` 无需编译，Docker 兼容性好；`bcrypt` 性能更好 |
| Q9 | **前端状态管理**：认证状态用 React Context 还是已有的 Zustand？ | 若项目已用 Zustand，建议统一用 Zustand 管理 auth slice |

---

## 附录 A：术语表

| 术语 | 说明 |
|------|------|
| JWT | JSON Web Token，一种无状态的身份凭证 |
| Access Token | 短期有效的访问令牌，携带用户信息和权限 |
| Refresh Token | 长期有效的刷新令牌，用于获取新的 Access Token |
| httpOnly Cookie | 不允许 JavaScript 访问的 Cookie，防 XSS 窃取 |
| bcrypt | 自适应密码哈希算法，内置加盐和防暴力破解 |
| RBAC | 基于角色的访问控制（Role-Based Access Control） |
| Token Rotation | 每次刷新时旧 Refresh Token 失效，防止重放攻击 |
| Token Family | 同一登录会话派生出的所有 Refresh Token，便于批量撤销 |

---

## 附录 B：前后端改动清单

### 后端改动（`backend/src/auth.mjs`）

| 函数/变量 | 当前行为 | 目标行为 |
|-----------|---------|---------|
| `buildRequestContext()` | 从 Header `x-user-id`/`x-team-id` 读取 | 从 JWT Bearer Token 解析 |
| `requirePermission()` | 空函数 | 实际校验 `context.permissions.includes(permission)` |
| `assertTeamAccess()` | 空函数 | 校验 `context.teamId === resourceTeamId` |
| `filterByTeam()` | 直接返回全部 | 按 `context.teamId` 过滤（super_admin 除外） |
| 新增 `authenticate()` | 无 | JWT 解析中间件，注入 context |
| 新增 `refreshToken()` | 无 | 校验 Refresh Token，签发新 Token 对 |
| `PERMISSIONS` | 15 项 | 17 项（+ `team.manage`、`user.manage`） |

### 前端新增文件

| 文件 | 说明 |
|------|------|
| `features/auth/LoginPage.tsx` | 登录表单页 |
| `features/auth/RegisterPage.tsx` | 注册表单页 |
| `features/auth/SettingsPage.tsx` | 用户设置（资料 + 密码） |
| `shared/auth/AuthContext.tsx` | 认证状态 Context Provider |
| `shared/auth/AuthGuard.tsx` | 路由守卫组件 |
| `shared/auth/useAuth.ts` | 认证 Hook |

### 前端改动文件

| 文件 | 改动 |
|------|------|
| `App.tsx` | 拆分路由（公开路由 + 认证路由），包裹 AuthProvider + AuthGuard，菜单根据权限动态渲染 |
| `shared/services/api.ts` | 添加 `Authorization` Header 注入，401 自动刷新 Token，credentials: 'include' |
| `main.tsx` | 包裹 AuthProvider |
