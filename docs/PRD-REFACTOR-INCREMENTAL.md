# Vocos 重构增量 PRD

> **版本**：v1.0  
> **作者**：许清楚（产品经理）  
> **日期**：2026-06-04  
> **状态**：草案  
> **重构策略**：保留部署版 PDF/Word 报告导出 + 真实 AI Prompt，其余按 Codex 架构重构

---

## 目录

1. [项目背景和重构目标](#1-项目背景和重构目标)
2. [部署版现状](#2-部署版现状)
3. [Codex 架构要点](#3-codex-架构要点)
4. [增量需求池](#4-增量需求池)
5. [保留清单](#5-保留清单)
6. [风险点和待确认问题](#6-风险点和待确认问题)
7. [附录：模块对表](#7-附录模块对表)

---

## 1. 项目背景和重构目标

### 1.1 背景

Vocos 当前有两个版本：

| 维度         | 部署版（E:\workbuddy\vocos）                               | Codex 重构版（E:\codex\vocosai）                           |
| ------------ | ---------------------------------------------------------- | ---------------------------------------------------------- |
| 后端语言     | Python（Flask）                                            | Node.js（Express）                                         |
| 数据库       | SQLite                                                     | SQLite（better-sqlite3）                                   |
| 前端架构     | 单文件 HTML（402KB，Tailwind CDN）                         | React 18 + TypeScript + Vite + MUI + Zustand + Dexie.js    |
| AI 编排      | 15 个 Agent（真实 Prompt，已验证可用）                     | 17 个 Agent（Schema 验证 + 重试机制，Prompt 需重新编写）   |
| 报告导出     | PDF（reportlab）+ Word（python-docx）                      | Markdown + HTML + XLSX                                     |
| 标签体系     | VALUE_CATEGORIES 字典                                      | 13 维中文评论标签体系（comment-insights.mjs）              |
| 模型网关     | 无（单一模型）                                             | 多模型网关（DeepSeek/OpenAI/Claude，路由+回退）            |
| 治理能力     | 无                                                         | RBAC、成本治理、质量治理                                   |
| 部署方式     | 裸机部署                                                   | Docker + docker-compose + Nginx + GitHub Actions CI/CD     |
| 任务状态机   | 无                                                         | pending → running → completed → failed                     |

### 1.2 重构目标

1. **架构升级**：从 Python Flask 单体迁移到 Node.js Codex 模块化架构，提升可维护性和可扩展性。
2. **能力保留**：保留部署版经过验证的核心能力——真实 AI Prompt（15 个 Agent）和 PDF/Word 报告导出。
3. **增量迭代**：不追求一步到位全量替换，而是以增量需求池的方式，按 P0/P1/P2 优先级分阶段交付。
4. **前端现代化**：从 402KB 单文件 HTML 迁移到 React + TypeScript 现代化前端。
5. **治理完整**：补齐 RBAC、成本追踪、质量评分等治理能力。
6. **部署标准化**：Docker 化部署，CI/CD 自动化流水线。

### 1.3 重构原则

- **存量优先**：已验证的 Prompt 和报告导出能力必须保留，不做破坏性改动。
- **模块对齐**：后端模块逐一对表 Codex 架构，缺失模块补齐，已有模块复用。
- **前端渐进**：React 前端分页面逐步迁移，初期可保留 HTML 页面做灰度验证。
- **数据兼容**：数据库 schema 变更需提供迁移脚本，确保历史数据不丢失。

---

## 2. 部署版现状

### 2.1 后端文件结构

```
E:\workbuddy\vocos\
├── app.py                    # Flask 主入口（路由、API、WebSocket）
├── requirements.txt          # Python 依赖
├── Dockerfile                # 现有 Docker 配置
├── Dockerfile.fix
├── docker-compose.yml
├── nginx.conf
├── .env.example
├── start.sh
├── setup.sh
├── fix_python311.sh
├── db/
│   ├── schema.sql            # 数据库建表语句
│   └── seed.sql              # 示例数据
├── services/
│   ├── agent_service.py      # 15 个 AI Agent 实现（核心资产）
│   ├── export_service.py     # PDF + Word 报告导出（核心资产）
│   ├── cache_service.py      # 缓存服务
│   └── auth_service.py       # 认证服务
├── static/
│   └── index.html            # 前端 SPA（402KB）
└── uploads/                  # 文件上传目录
```

### 2.2 数据库表结构（核心表）

| 表名            | 用途                     | 重构策略           |
| --------------- | ------------------------ | ------------------ |
| comments        | 评论数据主表             | 保留，字段逐一对表 |
| ai_run_steps     | AI 执行步骤日志          | 合并到 state-machine |
| ai_runs          | AI 执行记录              | 合并到 state-machine |
| strategies      | 策略卡数据               | 保留               |
| reports         | 报告记录                 | 保留               |
| users           | 用户表                   | 对齐 RBAC          |
| projects        | 项目表                   | 保留               |
| value_categories | 价值分类              | 替换为 13 维标签   |

### 2.3 前端页面清单

| 页面名称       | 功能简述                     | 迁移优先级 |
| -------------- | ---------------------------- | ---------- |
| 决策台         | 数据总览仪表盘               | P0         |
| 评论信号池     | 评论导入 + 清洗 + 分析结果   | P0         |
| 需求地图       | 需求洞察可视化               | P0         |
| 购买障碍地图   | 用户购买障碍分析             | P1         |
| 竞品机会地图   | 竞品对比分析                 | P1         |
| 策略卡         | 策略生成与管理               | P0         |
| 内容实验室     | 内容创作与测试               | P1         |
| 复盘归因       | 效果复盘分析                 | P2         |
| 报告中心       | 报告管理与导出               | P0         |
| 品牌中心       | 品牌数据管理                 | P2         |
| 对标中心       | 对标分析                     | P2         |
| AI 分析中心    | AI 分析结果总览              | P1         |

### 2.4 评论导入能力

- **支持格式**：xlsx、csv、json
- **自动识别**：中英文列名（评论ID、评论内容、点赞量、评论时间、IP地址等 20+ 字段）
- **导入流程**：文件上传 → 列名识别 → 字段映射 → 数据校验 → 入库

### 2.5 保留能力清单（不动项）

| 能力               | 说明                                         | 保留原因                     |
| ------------------ | -------------------------------------------- | ---------------------------- |
| 15 个 AI Agent Prompt | agent_service.py 中的完整 Prompt 定义    | 经过业务验证，效果可靠       |
| PDF 报告导出       | reportlab 生成 PDF                           | 部署版的差异化能力           |
| Word 报告导出      | python-docx 生成 .docx                          | 部署版的差异化能力           |
| 评论导入字段映射   | 20+ 字段自动识别逻辑（含中英文列名）         | 用户已习惯当前导入体验       |
| VALUE_CATEGORIES   | 价值分类字典（作为过渡）                     | 可平滑过渡到 13 维标签       |

**重要说明**：PDF/Word 导出能力依赖 Python（reportlab + python-docx），需要决策：

- **方案 A（推荐）**：保留 Python 微服务负责报告导出，Node.js 主服务调用它。
- **方案 B**：在 Node.js 中寻找替代方案（如 pdfkit、docx-templater），但质量需验证。
- **方案 C**：通过子进程调用 Python 脚本导出。

---

## 3. Codex 架构要点

### 3.1 可复用的设计模式

Codex 版本有 12 个核心模块，重构时应完整复用其设计理念：

#### 模块 1：Agent 注册 + 编排（agents.mjs）

```
设计要点：
- 统一的 Agent 注册接口：{ name, description, prompt, inputSchema, outputSchema, retry }
- 内置重试机制（maxRetries / retryDelay）
- Agent 执行生命周期钩子（beforeRun / afterRun / onError）
- 支持 Agent 链式编排（前一个输出作为后一个输入）
```

**对表部署版**：将 agent_service.py 的 15 个 Agent 迁移到此模块，保留原始 Prompt，补充 Schema 和重试配置。

#### 模块 2：JSON Schema 验证（schemas.mjs + schema-validator.mjs）

```
设计要点：
- 每个 Agent 输出有对应的 JSON Schema
- 统一 Schema 验证器（支持 draft-07）
- 验证失败处理策略：重试 → 降级 → 报错
```

**对表部署版**：为 15 个 Agent 定义输出 Schema（部署版当前无 Schema 验证）。

#### 模块 3：13 维标签体系（comment-insights.mjs）

```
13 个维度：
情感倾向 | 购买意图 | 使用场景 | 目标人群 | 价格敏感度 | 
功能需求 | 体验反馈 | 竞品提及 | 品牌认知 | 渠道偏好 | 
触媒习惯 | 决策因素 | 痛点强度
```

**对表部署版**：用 13 维标签取代 VALUE_CATEGORIES 字典，需要迁移数据和 Prompt 适配。

#### 模块 4：多模型网关（model-gateway.mjs + model-adapters.mjs）

```
设计要点：
- 统一模型调用接口：chat(messages, options)
- 模型路由（基于任务类型 + 成本阈值）
- 故障回退（主模型不可用 → 备用模型）
- 模型适配器模式（新增模型只需实现 Adapter 接口）
```

**对表部署版**：部署版当前单模型直连，需新增网关层。

#### 模块 5：RBAC 认证（auth.mjs）

```
设计要点：
- 三级角色：Admin / Editor / Viewer
- API Key 加密存储
- 基于角色的路由中间件
```

**对表部署版**：部署版有基础 auth_service.py，需对齐到 RBAC 模型。

#### 模块 6：成本治理（cost-governance.mjs）

```
设计要点：
- 每次 Agent 调用的 Token 用量记录
- 按模型 / Agent / 用户 / 项目维度的成本统计
- 预算告警机制
```

**对表部署版**：部署版无此能力，为新增模块。

#### 模块 7：质量治理（quality-governance.mjs）

```
设计要点：
- Agent 输出质量评分（完整性 / 一致性 / 可用性）
- 评分低于阈值的自动重试或告警
- 历史质量趋势报告
```

**对表部署版**：部署版无此能力，为新增模块。

#### 模块 8：任务状态机（state-machine.mjs）

```
设计要点：
- 状态枚举：pending → running → completed → failed → cancelled
- 状态转换原子化
- 任务重试策略
- 任务超时检测
```

**对表部署版**：部署版有 ai_runs / ai_run_steps 表，需对齐到统一状态机。

#### 模块 9：数据层（store.mjs）

```
设计要点：
- better-sqlite3（同步 API，性能优于 sqlite3）
- 参数化查询防注入
- 迁移脚本管理
```

**对表部署版**：从 Python sqlite3 迁移到 better-sqlite3。

#### 模块 10：报告生成（report-generator.mjs）

```
现有能力：Markdown + HTML + XLSX
缺失能力：PDF + Word

重构策略：保留 Codex 的 Markdown/HTML/XLSX 能力，新增 PDF/Word 能力。
```

**对表部署版**：Codex 的报告生成器中新增 PDF 和 Word 格式支持。

#### 模块 11：Docker + CI/CD

```
设计要点：
- 多阶段 Docker 构建（前端构建 → 后端打包 → 运行镜像）
- docker-compose（前端 + 后端 + Nginx）
- GitHub Actions 自动构建 + 测试 + 部署
```

#### 模块 12：React 前端

```
技术栈：
- React 18 + TypeScript
- Vite（构建工具）
- MUI（UI 组件库）
- Zustand（状态管理）
- Dexie.js（IndexedDB 本地缓存）
- React Router（路由）
```

---

## 4. 增量需求池

### 4.1 P0 — 必须改（阻塞上线的关键缺口）

| 编号   | 需求                               | 说明                                                                                                                                         | 涉及模块                                                |
| ------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| P0-01  | Python → Node.js 后端迁移          | 将 Flask 主入口（app.py）的路由 / API / WebSocket 逻辑迁移到 Node.js（server.mjs），保持 API 接口兼容。                                         | src/server.mjs                                          |
| P0-02  | 15 个 Agent 迁移到 agents.mjs       | 将 agent_service.py 中 15 个 Agent 的 Prompt 完整迁移到 agents.mjs，为每个 Agent 补充输入/输出 JSON Schema，启用重试机制。                       | agents.mjs, schemas.mjs                                 |
| P0-03  | 13 维标签体系替换 VALUE_CATEGORIES | 用 comment-insights.mjs 的 13 维标签体系替换 VALUE_CATEGORIES 字典，确保 Agent Prompt 适配新标签体系，编写评论数据标签迁移脚本。                | comment-insights.mjs, agents.mjs                        |
| P0-04  | 报告导出：PDF + Word               | 在 Codex 的 report-generator.mjs 中新增 PDF 和 Word 导出能力。优先方案：Python 微服务（复用现有 reportlab + python-docx），Node.js 通过 HTTP 调用。 | report-generator.mjs, export_service.py（微服务化）      |
| P0-05  | 核心页面 React 重构                | 重构以下核心页面为 React 组件：决策台（仪表盘）、评论信号池（导入+分析）、需求地图（可视化）、策略卡（生成与管理）、报告中心（导出管理）。       | React 前端                                              |
| P0-06  | 数据库 Schema 对齐                 | 部署版 SQLite 表结构对齐 Codex store.mjs 设计，编写迁移脚本，确保评论数据、策略数据、报告记录不丢失。                                          | store.mjs, schema.sql 迁移脚本                          |
| P0-07  | 评论导入能力迁移                   | 将 xlsx/csv/json 自动识别 + 列名映射逻辑从 Python 迁移到 Node.js（使用 xlsx/sheetjs / csv-parse），保持 20+ 字段支持。                           | 新建 import-service.mjs                                 |
| P0-08  | 多模型网关接入                     | 集成 model-gateway.mjs + model-adapters.mjs，配置 DeepSeek 为主模型，OpenAI/Claude 为备用，支持路由和回退。                                   | model-gateway.mjs, model-adapters.mjs                   |

### 4.2 P1 — 应该改（上线后快速迭代）

| 编号   | 需求                     | 说明                                                                                               | 涉及模块                              |
| ------ | ------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------- |
| P1-01  | RBAC 认证对齐            | 将部署版 auth_service.py 的用户体系迁移到 auth.mjs RBAC 模型（Admin/Editor/Viewer），API Key 加密。  | auth.mjs                              |
| P1-02  | 成本治理接入             | 接入 cost-governance.mjs，为所有 Agent 调用记录 Token 用量，实现按模型/Agent/用户/项目的成本统计。    | cost-governance.mjs                   |
| P1-03  | 质量治理接入             | 接入 quality-governance.mjs，为 Agent 输出评分，低于阈值自动重试或告警。                              | quality-governance.mjs                |
| P1-04  | 任务状态机对齐           | 用 state-machine.mjs 替代 ai_runs / ai_run_steps 表逻辑，统一任务生命周期管理。                       | state-machine.mjs                     |
| P1-05  | 扩展页面 React 重构      | 重构以下页面：购买障碍地图、竞品机会地图、内容实验室、AI 分析中心。                                    | React 前端                            |
| P1-06  | 数据处理服务拆分         | 将评论清洗、语义分析、洞察聚类从 Agent 服务中拆分为独立服务，便于复用和测试。                          | 新建清洗/分析/聚类服务                |
| P1-07  | Docker 部署标准化        | 完成 Docker + docker-compose + Nginx 部署配置，确保一键部署。                                        | Dockerfile, docker-compose.yml         |
| P1-08  | 存量数据迁移脚本         | 编写从部署版 SQLite 到 Codex 新 Schema 的完整数据迁移脚本，含数据校验。                               | 迁移脚本                              |

### 4.3 P2 — 建议改（长期优化）

| 编号   | 需求                     | 说明                                                                                               | 涉及模块                              |
| ------ | ------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------- |
| P2-01  | CI/CD 流水线            | GitHub Actions 配置：代码检查 → 单元测试 → Docker 构建 → 自动部署。                                  | .github/workflows                     |
| P2-02  | 剩余页面 React 重构      | 重构：复盘归因、品牌中心、对标中心。                                                                | React 前端                            |
| P2-03  | WebSocket 实时推送       | 将部署版的 WebSocket 实时状态推送迁移到 Node.js（socket.io）。                                       | server.mjs                            |
| P2-04  | 本地缓存优化             | 前端接入 Dexie.js（IndexedDB），缓存评论分析结果，减少重复请求。                                     | React 前端                            |
| P2-05  | 国际化支持               | 前端 + 后端国际化（i18n），支持中英文切换。                                                          | 全栈                                  |
| P2-06  | 监控告警                 | 接入应用性能监控（APM）和错误追踪（如 Sentry）。                                                     | 运维配置                              |
| P2-07  | 报告模板自定义           | 用户可自定义 PDF/Word 报告模板（页眉/页脚/图表样式/字体等）。                                        | report-generator.mjs                  |
| P2-08  | Agent 热更新             | 支持在不重启服务的情况下更新 Agent Prompt 和 Schema。                                                | agents.mjs                            |

---

## 5. 保留清单

### 5.1 核心保留项

| 保留项                           | 保留策略                                                                 | 不动原因                                 |
| -------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| 15 个 AI Agent Prompt            | 完整迁移到 agents.mjs，不做修改                                          | 经过业务验证，效果可靠                   |
| PDF 报告导出（reportlab）        | 作为独立 Python 微服务保留，Node.js 通过 HTTP 调用                       | reportlab 在 Python 生态中无可替代         |
| Word 报告导出（python-docx）     | 作为独立 Python 微服务保留，Node.js 通过 HTTP 调用                       | python-docx 在 Python 生态中无可替代       |
| 评论导入字段映射逻辑（20+ 字段） | 逻辑迁移到 Node.js，但映射规则表（中英文列名对表）完整保留               | 用户习惯 + 数据兼容                       |
| 前端页面布局和交互               | React 重构时保持页面布局一致，交互体验不变                               | 降低用户学习成本                         |

### 5.2 过渡保留项（后续逐步替换）

| 过渡项                  | 当前状态           | 过渡策略                                           | 最终状态           |
| ----------------------- | ------------------ | -------------------------------------------------- | ------------------ |
| VALUE_CATEGORIES 字典   | 在 agent_service.py | P0 阶段用 13 维标签替换，旧数据通过迁移脚本做映射   | 13 维标签体系      |
| auth_service.py         | 基础认证           | P0 阶段保留兼容，P1 阶段对齐 RBAC                   | auth.mjs RBAC      |
| ai_runs / ai_run_steps   | 任务记录表         | P0 阶段保留使用，P1 阶段对齐 state-machine           | state-machine.mjs  |

---

## 6. 风险点和待确认问题

### 6.1 技术风险

| 风险项                              | 影响级别 | 说明                                                                                                        | 缓解措施                                                     |
| ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Prompt 迁移后效果衰减               | 高       | 虽然 Prompt 原文不变，但调用链路（模型网关、Schema 验证）变化可能影响 Agent 输出质量                            | P0 阶段逐 Agent 对比验证，保留旧版本作为回退                   |
| PDF/Word 导出微服务化     | 高       | Python 微服务引入额外的运维复杂度和网络延迟                                                                    | 方案评估阶段做性能压测，确保导出延迟在可接受范围内（< 30s）   |
| 数据库 Schema 迁移数据丢失          | 高       | comments 表字段映射、VALUE_CATEGORIES → 13 维标签的语义对齐可能不完美                                           | 迁移前全量备份，迁移后逐条校验，提供回滚脚本                    |
| 评论导入格式兼容性                  | 中       | xlsx/csv/json 格式在 Node.js 生态的解析库（sheetjs/csv-parse）可能与 Python（openpyxl/pandas）行为不一致       | 建立导入测试用例库（覆盖全部 20+ 字段的中英文列名）             |
| 性能差异：Python vs Node.js         | 中       | 评论处理逻辑从 Python 迁移到 Node.js 后性能特征可能不同（CPU 密集型 vs I/O 密集型）                              | 对评论清洗/分析做性能基准测试，必要时保留 Python 子进程处理     |
| 前端重构工作量低估                   | 中       | 12 个页面的 React 重构工作量可能被低估，尤其是复杂的交互（拖拽、图表、实时更新）                                  | P0 仅交付核心 5 页，P1 扩展 4 页，P2 补齐剩余                    |

### 6.2 业务风险

| 风险项                              | 影响级别 | 说明                                                                                                        | 缓解措施                                                     |
| ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 用户学习成本                        | 中       | 虽然布局不变，但 React 重构后性能和行为细节可能不同（如响应速度、动画效果）                                     | 灰度发布，内部试用 1-2 周收集反馈后再全量                        |
| 15 个 Agent 测试覆盖不足            | 中       | 每个 Agent 有多条输入/输出路径，P0 阶段可能来不及全量回归测试                                                  | 优先覆盖高频路径（评论分析、策略生成），低频路径（品牌分析等）P1 补测试 |

### 6.3 待确认问题

| 编号 | 问题                                                         | 提出方     | 影响决策                                       |
| ---- | ------------------------------------------------------------ | ---------- | ---------------------------------------------- |
| Q-01 | PDF/Word 导出微服务化的可行性是否确认？是否需要技术方案评审？   | 产品       | P0-04 的实现方式                               |
| Q-02 | 模型配置：主模型 DeepSeek 的具体版本和 API 密钥是否已就绪？     | 产品       | P0-08 多模型网关配置                           |
| Q-03 | 部署版现有用户数据量多大？comments 表记录数？迁移脚本的执行时间估算需此数据。 | 产品       | P1-08 存量数据迁移计划                         |
| Q-04 | 是否需要保留部署版作为回退方案？灰度期间的流量分配策略是什么？   | 产品       | 发布策略和运维准备                             |
| Q-05 | React 前端组件库选型确认：MUI 是否已定？图表库（ECharts / Recharts / Nivo）是否已有决定？ | 产品       | 前端开发启动条件                               |
| Q-06 | API 接口兼容性要求：是否需要保持与部署版完全一致，还是允许合理调整？ | 产品       | P0-01 后端迁移的接口设计                       |
| Q-07 | 报告导出微服务是否部署在同一 Docker 网络中？还是独立部署？     | 运维       | 部署架构设计                                   |

---

## 7. 附录：模块对表

### 7.1 部署版 → Codex 后端模块对表

| 部署版模块               | Codex 对应模块             | 迁移策略                 | 优先级 |
| ------------------------ | -------------------------- | ------------------------ | ------ |
| app.py（路由层）         | src/server.mjs             | 重写                     | P0     |
| agent_service.py         | agents.mjs + schemas.mjs   | 迁移 Prompt + 新增 Schema | P0     |
| export_service.py（PDF） | report-generator.mjs + Python 微服 | 微服务化保留       | P0     |
| export_service.py（Word）| report-generator.mjs + Python 微服 | 微服务化保留       | P0     |
| auth_service.py          | auth.mjs                   | 对齐 RBAC                | P1     |
| cache_service.py         | （无对应，可新增）         | 按需实现                 | P2     |
| VALUE_CATEGORIES         | comment-insights.mjs       | 替换为 13 维标签         | P0     |
| ai_runs / ai_run_steps    | state-machine.mjs          | 对齐状态机               | P1     |
| — （无）                  | model-gateway.mjs          | 新增                     | P0     |
| — （无）                  | model-adapters.mjs         | 新增                     | P0     |
| — （无）                  | cost-governance.mjs        | 新增                     | P1     |
| — （无）                  | quality-governance.mjs     | 新增                     | P1     |
| — （无）                  | schema-validator.mjs       | 新增                     | P0     |
| db/schema.sql             | store.mjs                  | 对齐 Schema + 迁移       | P0     |

### 7.2 部署版 → Codex 前端页面对表

| 部署版页面     | P0 重构 | P1 重构 | P2 重构 |
| -------------- | ------- | ------- | ------- |
| 决策台         | ✅      |         |         |
| 评论信号池     | ✅      |         |         |
| 需求地图       | ✅      |         |         |
| 策略卡         | ✅      |         |         |
| 报告中心       | ✅      |         |         |
| 购买障碍地图   |         | ✅      |         |
| 竞品机会地图   |         | ✅      |         |
| 内容实验室     |         | ✅      |         |
| AI 分析中心    |         | ✅      |         |
| 复盘归因       |         |         | ✅      |
| 品牌中心       |         |         | ✅      |
| 对标中心       |         |         | ✅      |

---

> **文档维护**：本文档由产品经理许清楚维护，需求变更时同步更新。  
> **下一步**：技术评审确认 Q-01 ~ Q-07 后，进入详细设计阶段。
