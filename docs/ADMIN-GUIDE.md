## VOCOS 系统管理员手册

### 一、系统入口

```
前端:  https://vocosai.com
管理:  前端页面内直接操作（超级管理员登录后可见所有管理功能）
API:   https://vocosai.com/api
```

### 二、管理员账号（3个预设账号）

| 账号 | 角色 | 权限范围 | 用途 |
|------|------|---------|------|
| `admin@vocos.local` | super_admin | 全部权限（用户管理/团队管理/成本查看等） | 系统管理员 |
| `ai@vocos.local` | ai_engineer_admin | AI模块+Schema+Prompts+Model管理 | AI工程师 |
| `member@vocos.local` | member | 只读（查看任务/报告） | 普通成员 |

默认密码: `admin123`（首次登录后请立即修改）

### 三、角色权限体系（4个角色）

| 权限 | super_admin | team_admin | ai_engineer_admin | member |
|------|:---:|:---:|:---:|:---:|
| 任务查看 | ✅ | ✅ | ✅ | ✅ |
| 任务创建/编辑 | ✅ | ✅ | — | — |
| AI分析运行 | ✅ | ✅ | ✅ | — |
| 报告查看/生成 | ✅ | ✅ | ✅ | ✅ |
| 成本查看 | ✅ | ✅ | — | — |
| 质量查看 | ✅ | ✅ | ✅ | — |
| 审计日志 | ✅ | ✅ | — | — |
| Schema管理 | ✅ | — | ✅ | — |
| Prompt管理 | ✅ | — | ✅ | — |
| Model管理 | ✅ | — | ✅ | — |
| **团队管理** | ✅ | ✅ | — | — |
| **用户管理** | ✅ | — | — | — |

### 四、用户管理操作（仅 super_admin）

#### 1. 创建新用户
通过管理员页面 → 用户管理 → 添加用户
或 API:
```bash
POST /api/admin/users
Body: { "name": "新用户", "email": "new@example.com", "password": "...", "role": "member" }
```

#### 2. 修改用户角色/权限
通过管理员页面 → 用户管理 → 编辑用户角色
支持切换: super_admin / team_admin / ai_engineer_admin / member

#### 3. 禁用/启用用户
通过管理员页面 → 用户管理 → 切换状态
或 API: PUT /api/admin/users/:id/status

### 五、系统架构

```
前端: React + Vite + MUI + Tailwind → GitHub Pages vocosai.com
后端: Node.js + better-sqlite3 → 腾讯 CloudBase
AI:   DeepSeek API (deepseek-v4-flash / deepseek-v4-pro)
代码: GitHub → https://github.com/Mikesure000/vocosai.com
```

### 六、功能模块总览（21页）

| 页面 | 路径 | 权限 |
|------|------|------|
| 决策台 | `/` | 全部 |
| 评论信号池 | `/signals` | task.read |
| 归因工作台 | `/attribution/:taskId` | task.read |
| 内容生产卡 | `/production-cards` | task.read |
| 品类知识库 | `/category` | task.read |
| 平台方法论 | `/methodology` | task.read |
| 品牌中心 | `/brand` | 全部 |
| 项目中心 | `/projects` | task.read |
| 团队协作 | `/team` | task.read |
| 报告中心 | `/reports` | report.read |
| 策略管理 | `/strategy` | schema.read |
| AI分析中心 | `/ai-center` | ai_run.read |
