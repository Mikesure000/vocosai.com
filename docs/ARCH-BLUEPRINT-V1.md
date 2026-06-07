# Vocos 系统架构蓝图 V1 — 差距分析与阶段规划

> **版本**: v1.0 | **作者**: 高见远（系统架构师）  
> **日期**: 2026-06-06 | **基于**: 现有系统代码审计 + 架构文档对标

---

## 1. 差距分析总结

当前系统已具备坚实的工程底座（JWT+RBAC认证、17Agent管线、13维评论标签体系、多模型网关、成本/质量治理），但核心业务闭环严重缺失。**最关键的差距是"内容-评论归因系统"完全不存在**——这恰是产品从"评论分类工具"升级为"可交付客户决策系统"的桥梁。此外，内容生产卡、投流适配、发布前质检、评论区运营等端到端产出模块尚未建设，导致系统当前止步于"分析"环节，无法完成"分析→策略→生产→质检→复盘"的完整闭环。

---

## 2. 阶段1 MVP 架构设计（2-3个月）

### 2.1 核心数据模型新增（ERD 级别）

以下为阶段1需要新增的数据库表（在现有 schema 基础上追加）：

#### 表: brand_profiles — 品牌档案
```
id (TEXT PK)              品牌ID
team_id (TEXT FK→teams)   所属团队
brand_name (TEXT)          品牌名称
industry (TEXT)            行业分类（beauty/food/health/...）
category_id (TEXT FK)      关联品类ID
logo_url (TEXT)            品牌Logo
brand_bio (TEXT)           品牌简介
products (TEXT JSON)       产品列表 [{name, category, price_range,...}]
target_audience (TEXT JSON) 目标人群画像
key_messages (TEXT JSON)   核心品牌信息
competitive_advantage (TEXT) 竞争优势描述
status (TEXT)              active/archived
created_at/updated_at
```

#### 表: category_knowledge — 品类知识库
```
id (TEXT PK)
industry (TEXT)            行业
category_name (TEXT)       品类名称
need_taxonomy (TEXT JSON)  [{code, label, description, severity}]
barrier_taxonomy (TEXT JSON) [{code, label, description, frequency}]
audience_segments (TEXT JSON) [{segment, traits, pain_points}]
competitor_benchmarks (TEXT JSON) [{brand, strength, weakness}]
platform_tactics (TEXT JSON) {douyin: {...}, xiaohongshu: {...}}
version (TEXT)
created_at/updated_at
```

#### 表: attribution_results — 归因分析结果（核心新表）
```
id (TEXT PK)
task_id (TEXT FK→analysis_tasks)
content_point_id (TEXT)   内容要点ID（如"开头钩子"）
content_point_text (TEXT) 内容要点文本
reaction_type (TEXT)      反应类型（positive/negative/question/action/mixed）
reaction_count (INT)      反应数量
impact_score (REAL)       影响程度评分（1-10）
sentiment_distribution (TEXT JSON) {positive: N, negative: N, neutral: N}
representative_comments (TEXT JSON) [{commentId, text, likeCount}]
demand_signals (TEXT JSON) 关联的需求信号 [{demandCode, strength}]
barrier_signals (TEXT JSON) 关联的障碍信号 [{barrierCode, strength}]
insight_text (TEXT)        人类可读的归因洞察
agent_run_id (TEXT FK→ai_runs) 产生此结果的AI Run
created_at
```

#### 表: content_production_cards — 内容生产卡
```
id (TEXT PK)
task_id (TEXT FK→analysis_tasks)
card_type (TEXT)           douyin / xiaohongshu
title (TEXT)               生产卡标题
target_audience_pain_point (TEXT) 指向的用户痛点
hook_strategy (TEXT)       钩子策略
script_structure (TEXT JSON) 脚本结构 [{segment, duration, content, visual}]
copywriting (TEXT)         文案全文
asset_specs (TEXT JSON)    素材规格要求 [{type, description, source}]
supporting_evidence (TEXT JSON) 证据链 [commentId, ...]
selling_points (TEXT JSON) 突出卖点 [{point, evidence}]
objection_handling (TEXT JSON) 预设异议应对 [{objection, response}]
expected_outcome (TEXT)    预期效果
ab_test_variables (TEXT JSON) 可优化变量 [{variable, variantA, variantB}]
quality_check_result (TEXT JSON) 质检结果
agent_run_id (TEXT FK→ai_runs)
status (TEXT)              draft/reviewed/approved/published
created_at/updated_at
```

#### 表: quality_checks — 发布前质检记录
```
id (TEXT PK)
production_card_id (TEXT FK→content_production_cards)
check_type (TEXT)          合规/一致性/卖点/受众/平台/竞品/敏感词/可执行/完整性
result (TEXT)              pass/fail/warning
score (INT)                0-100
detail (TEXT)              详细说明
suggestion (TEXT)          修改建议
reviewer (TEXT)            agent / human
created_at
```

#### 表: platform_methodologies — 平台方法论
```
id (TEXT PK)
platform (TEXT)            douyin / xiaohongshu
content_type (TEXT)        内容类型（评测/教程/vlog/...）
best_practice (TEXT JSON)  最佳实践 [{rule, explanation, example}]
forbidden_patterns (TEXT JSON) 平台避坑 [{pattern, reason, consequence}]
recommended_formats (TEXT JSON) 推荐格式 [{format, when_to_use, spec}]
version (TEXT)
updated_at
```

### 2.2 归因系统架构（输入→处理→输出）

这是阶段1的核心系统，弥补当前最大缺口。

```
┌─────────────────────────────────────────────────────────────────┐
│                    归因系统 (Attribution Engine)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ 1.输入层     │───▶│ 2.归因推理   │───▶│ 3.输出层     │      │
│  │ (Input Layer)│    │ (Inference)  │    │ (Output)     │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                                 │
│  输入数据:                                                       │
│  ├─ 原内容（标题+正文+结构）                                       │
│  ├─ 评论洞察（13维信号 + 高频评论）                                │
│  ├─ 内容拆解结果（content_decomposition_agent 输出）              │
│  └─ 品类知识（该品类的典型需求/障碍）                              │
│                                                                 │
│  归因推理过程 (content_comment_attribution_agent):               │
│  ├─ 第1步：内容要点提取                                          │
│  │   将原内容拆解为独立"内容单元"（开头钩子/卖点1/卖点2/...）       │
│  ├─ 第2步：评论-要点匹配                                         │
│  │   每条高价值评论匹配到其"回应"的内容要点                       │
│  ├─ 第3步：反应分类                                              │
│  │   positive(正面共鸣) / negative(质疑反驳) /                    │
│  │   question(追问好奇) / action(转化动作) / mixed(复合)          │
│  ├─ 第4步：需求/障碍推断                                         │
│  │   从用户反应中提取显性/隐性需求和购买障碍                       │
│  ├─ 第5步：影响度量化                                            │
│  │   基于评论数量+点赞量+关键词强度计算每个要点的impact_score      │
│  └─ 第6步：洞察生成                                              │
│      为每个要点生成人类可读的归因洞察文本                          │
│                                                                 │
│  输出:                                                          │
│  ├─ 归因矩阵（内容要点 × 反应类型 × 用户需求 × 购买障碍）         │
│  ├─ 内容缺口报告（用户想知道但内容没说到的）                       │
│  ├─ 卖点效果排名（哪个卖点最打动人/哪个引起最多质疑）             │
│  └─ 下一步内容策略建议（基于归因结果的优化方向）                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**归因推理 vs 评论分类的本质区别**:
- 评论分类（已有）：对每条评论打标签（购买意图/价格异议...）
- 归因推理（新增）：回答"为什么这个内容要点引发了这些评论反应？"——建立"内容→评论区"的因果链

### 2.3 AI Agent 管线（增强后）

阶段1的完整管线（加粗的为新增或重写）：

```
任务创建 → [1]任务目标识别Agent → [2]内容拆解Agent
                                            │
                   ┌────────────────────────┘
                   ▼
         [3]评论去重清洗Agent → [4]水军过滤Agent → [5]回复链重组Agent
                                            │
                   ┌────────────────────────┘
                   ▼
         [6]情感深度分析Agent → [7]高价值评论筛选Agent
                                            │
                   ┌────────────────────────┘
                   ▼
         [8]内容价值类型识别Agent
                   │
                   ▼
         ╔═══════════════════════════════════════════╗
         ║ [9]内容-评论归因Agent ★核心新增★          ║
         ║   输入: 内容拆解+评论洞察+品类知识         ║
         ║   输出: 归因矩阵+需求/障碍信号+洞察文本    ║
         ╚═══════════════════════════════════════════╝
                   │
         ┌─────────┼─────────┐
         ▼         ▼         ▼
   [10]需求/障碍  [11]平台策略 [12]内容生产卡 ★新增★
   聚类Agent     生成Agent   生成Agent
         │         │         │
         └─────────┼─────────┘
                   ▼
         [13]报告组装Agent
```

### 2.4 新 API 路由设计

#### 品牌与品类（模块1增强）
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/brands` | 列出团队品牌 |
| `POST` | `/api/brands` | 创建品牌 |
| `GET` | `/api/brands/:id` | 品牌详情 |
| `PUT` | `/api/brands/:id` | 更新品牌档案 |
| `DELETE` | `/api/brands/:id` | 删除品牌 |
| `GET` | `/api/categories` | 列出品类知识库 |
| `GET` | `/api/categories/:id` | 品类详情（含标签体系） |

#### 归因系统（模块6 - 全新）
| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/tasks/:id/attribution/run` | 启动归因分析 |
| `GET` | `/api/tasks/:id/attribution` | 获取归因结果矩阵 |
| `GET` | `/api/tasks/:id/attribution/content-gaps` | 获取内容缺口报告 |
| `GET` | `/api/tasks/:id/attribution/selling-points` | 获取卖点效果排名 |

#### 内容生产卡（模块9 - 全新）
| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/tasks/:id/production-cards/generate` | 生成内容生产卡 |
| `GET` | `/api/tasks/:id/production-cards` | 列出所有生产卡 |
| `GET` | `/api/production-cards/:id` | 生产卡详情 |
| `PUT` | `/api/production-cards/:id` | 编辑生产卡 |
| `POST` | `/api/production-cards/:id/export` | 导出生产卡（Markdown/PDF） |

#### 质检（模块12 - 全新）
| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/production-cards/:id/quality-check` | 执行质检 |
| `GET` | `/api/production-cards/:id/quality-check` | 获取质检结果 |

#### 平台方法论（模块8增强）
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/platforms/methodologies` | 列出平台方法论 |
| `GET` | `/api/platforms/methodologies/:platform` | 特定平台方法论 |

#### 报告导出增强（模块14）
| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/reports/:id/export/pdf` | 导出为PDF |
| `POST` | `/api/reports/:id/export/excel` | 导出为Excel附件包 |
| `POST` | `/api/tasks/:id/export/full` | 一键导出完整报告包 |

### 2.5 前端新页面/组件

#### 新增页面
| 页面 | 路由 | 对应模块 | 核心组件 |
|------|------|---------|---------|
| `ProjectsPage` | `/projects` | 模块1 | ProjectList, ProjectForm, ProjectCard |
| `BrandProfilePage` | `/brand/:id` | 模块1 | BrandEditor, CategoryPicker, ProductManager |
| `CategoryKnowledgePage` | `/category/:id` | 模块1 | CategoryLabels, NeedTaxonomyEditor, BarrierTaxonomyEditor |
| `AttributionWorkbench` | `/attribution/:taskId` | 模块6 | AttributionMatrix, ContentGapChart, SellingPointRanking, EvidenceChain |
| `ProductionCardsPage` | `/production-cards` | 模块9 | CardList, CardDetail, CardEditor, QualityBadge |
| `CardPreviewPage` | `/production-cards/:id` | 模块9 | ScriptTimeline, CopyPreview, AssetSpecs, EvidencePanel |
| `PlatformMethodologyPage` | `/methodology` | 模块8 | PlatformTabs, BestPracticeCards, ForbiddenPatterns |

#### 增强现有页面
| 页面 | 当前状态 | 阶段1增强 |
|------|---------|----------|
| `StrategyPage` | 仅展示Agent列表和模型路由 | +平台策略对比卡片（抖音 vs 小红书差异化输出） |
| `ContentLabPage` | 硬编码5种内容创意 | +接入归因系统，动态生成基于真实数据的内容创意 |
| `ReportsPage` | 基础列表+HTML预览 | +PDF导出按钮 +Excel附件下载 +多格式切换 |
| `SignalsPage` | 评论信号池（含导入） | +平台选择下拉 +内容目标选择器 +链接输入（模块2增强） |
| `BrandPage` | 静态品牌展示 | +品牌档案编辑 +品类关联 +产品管理 |
| `AttributionPage` | 空壳调用不存在的api | +完整归因矩阵 +内容缺口面板 +卖点效果排名 |

---

## 3. 任务分解

### 阶段1：MVP工具化（第1-12周）

| 任务ID | 名称 | 描述 | 依赖 | 预估文件数 | 阶段 |
|--------|------|------|------|-----------|------|
| **BL-001** | 品类知识库后端 | 创建 category_knowledge 表 + CRUD API + 种子数据（美妆品类） | 无 | 3 | 阶段1 |
| **BL-002** | 品牌档案后端 | 创建 brand_profiles 表 + CRUD API + 关联品类 | BL-001 | 3 | 阶段1 |
| **BL-003** | 归因系统核心引擎 | 实现 content_comment_attribution_agent 的完整推理逻辑（6步流程）| BL-001 | 4 | 阶段1 |
| **BL-004** | 归因API | POST attribution/run + GET attribution API | BL-003 | 2 | 阶段1 |
| **BL-005** | 归因系统Schema | 定义 attribution_results 表的 input/output JSON Schema | BL-003 | 2 | 阶段1 |
| **BL-006** | 平台方法论种子数据 | 创建 platform_methodologies 表 + 抖音/小红书最佳实践种子数据 | 无 | 2 | 阶段1 |
| **BL-007** | 平台策略Agent增强 | 重写 platform_strategy_agent Prompt，实现抖音/小红书差异化输出 | BL-006 | 2 | 阶段1 |
| **BL-008** | 内容生产卡后端 | 创建 content_production_cards 表 + 21字段 Schema + 生成API | BL-004, BL-007 | 4 | 阶段1 |
| **BL-009** | 质检系统 | 创建 quality_checks 表 + 9项检查逻辑 + API | BL-008 | 3 | 阶段1 |
| **BL-010** | 报告导出增强 | PDF/Excel一键导出 + 多格式报告包 | 无（增强现有） | 3 | 阶段1 |
| **BL-011** | 任务创建表单增强 | 平台选择(抖音/小红书) + 内容目标(8选项) + 链接输入 | 无（增强现有） | 2 | 阶段1 |
| **BL-012** | 归因工作台前端 | AttributionWorkbench 页面（归因矩阵+内容缺口+卖点排名） | BL-004 | 5 | 阶段1 |
| **BL-013** | 内容生产卡前端 | ProductionCardsPage + CardPreview + CardEditor | BL-008, BL-009 | 5 | 阶段1 |
| **BL-014** | 品牌档案前端 | BrandProfilePage + CategoryPicker + ProductManager | BL-002 | 4 | 阶段1 |
| **BL-015** | 品类知识库前端 | CategoryKnowledgePage + Label系统 | BL-001 | 3 | 阶段1 |
| **BL-016** | 报告导出前端增强 | ReportPage +PDF/Excel导出 +多格式预览切换 | BL-010 | 3 | 阶段1 |
| **BL-017** | 平台方法论前端 | PlatformMethodologyPage（抖音/小红书最佳实践展示） | BL-006 | 2 | 阶段1 |
| **BL-018** | 归因管线集成 | 将 attributor agent 集成到 task-pipeline 自动执行 | BL-003, BL-005 | 2 | 阶段1 |
| **BL-019** | 端到端测试与集成 | 完整流程测试：创建任务→导入评论→运行分析→查看归因→生成生产卡→质检→导出 | BL-012, BL-013, BL-016 | 3 | 阶段1 |

### 阶段2：代运营场景（第13-24周，规划中）

| 任务ID | 名称 | 描述 | 依赖 | 预估文件数 | 阶段 |
|--------|------|------|------|-----------|------|
| **BL-020** | 多项目仪表盘 | 跨项目对比视图（品牌维度/时间维度） | BL-002 | 3 | 阶段2 |
| **BL-021** | 白标报告系统 | 客户Logo+品牌色+自定义页眉页脚 | BL-010 | 4 | 阶段2 |
| **BL-022** | 客户交付模板 | 预设报告模板（周报/月报/季报/专题） | BL-021 | 3 | 阶段2 |
| **BL-023** | 评论区运营驾驶舱 | 置顶建议/回复话术/私信模板/负面评论处理 | BL-004 | 5 | 阶段2 |
| **BL-024** | 投流适配评分 | 9维评分模型 + 投流建议生成 | BL-004 | 4 | 阶段2 |
| **BL-025** | 发布后复盘 | 发布前后对比 + 数据闭环追踪 | BL-009 | 4 | 阶段2 |
| **BL-026** | 团队协作功能 | 多人评论审核 + 任务分配 + 审批流 | 阶段1数据模型 | 6 | 阶段2 |

### 依赖关系图

```
阶段1依赖链（关键路径标记★）:

BL-001 ★ → BL-002 → BL-014
BL-001 ★ → BL-003 ★ → BL-004 → {BL-005, BL-012, BL-018}
                     → BL-008 → BL-009, BL-013
BL-001 ★ → BL-015
BL-006 → BL-007 → BL-008
BL-010 → BL-016
BL-011（独立）  BL-017（独立）

关键路径: BL-001 → BL-003 → BL-004 → BL-008 → BL-013 → BL-019

并行执行建议:
- 前端 BL-011, BL-014, BL-015, BL-017 可并行
- 前端 BL-012 等待 BL-004
- 前端 BL-013 等待 BL-008 + BL-009
```

---

## 4. 关键风险和技术决策

### 4.1 技术决策

| 决策 | 理由 | 风险 |
|------|------|------|
| **归因系统用Agent而非规则引擎** | 内容-评论的归因关系高度依赖语义理解，无法用关键字规则覆盖。现有17个Agent框架已验证可用 | Agent输出质量依赖Prompt质量，需要Schema严格校验 |
| **品类知识库独立于品牌** | 品类级知识（如美妆的典型需求/障碍）应跨品牌复用，品牌可继承+覆盖。PRD定义过此策略 | 需要版本管理，品类级修改不可破坏已有品牌分析 |
| **生产卡21字段不再拆分表** | 21个字段虽有嵌套结构，但整体内聚性强，作为JSON字段存储+独立表查询效率可接受 | JSON字段无法SQL直接索引，需根据查询频率考虑部分字段提取 |
| **质检作为Agent而非规则检查** | 合规/一致性/卖点/受众/平台适配等检查需要语义理解能力，纯规则容易漏检 | Agent质检的一致性不如规则确定性高 |
| **保持零外部依赖策略** | 前后端均不引入新的NPM包（现有依赖已足够），SQLite单文件数据库 | 某些能力（如PDF生成）当前通过Python微服务解决 |

### 4.2 关键风险

| 风险 | 严重度 | 缓解措施 |
|------|--------|---------|
| **归因Agent幻觉** | 高 | 6步推理流程强制结构化输出，每步有独立Schema验证；输出带证据链（引用具体评论ID）；前端展示可追溯到源评论 |
| **Agent管线复杂度爆炸** | 中 | 管线中Agent从当前9步增至13步，每个Agent超时/失败/回退会级联。需加强task-pipeline的错误隔离和部分成功处理 |
| **品类知识冷启动** | 中 | 初期手工构建1-2个品类（美妆+食品），种子数据从现有部署版配置提取；后续通过AI分析结果反哺知识库 |
| **生产卡21字段可能不足** | 低 | 21字段为PRD初期定义，实际使用中可能需扩展。使用JSON嵌套字段便于向后兼容扩展 |
| **SQLite并发瓶颈** | 低 | 当前设计为本地单机工作站（蓝图定义），10+品牌单用户场景SQLite WAL模式足够。若未来需要多用户，会达到SQLite上限 |

---

## 5. 推荐的下一步行动（优先级从高到低）

### 1. [最高优先] 品类知识库种子数据构建 (BL-001)

**为什么先做**: 这是归因系统的上游依赖。没有品类知识（美妆的典型需求/障碍/人群），归因Agent无法做出有意义的推理。

**具体行动**:
- 创建 `category_knowledge` 表（已在数据模型设计中定义）
- 手工构建"美妆-眼膜/护肤品"品类知识：~10条典型需求 + ~8条典型购买障碍 + ~5个人群画像 + 竞品对标数据
- 数据源：当前系统已有的 COMMENT_SIGNAL_TAXONOMY（13维标签）可作为起点，但需要升级为品类级知识结构

### 2. [最高优先] 归因系统核心实现 (BL-003+BL-004+BL-005)

**为什么先做**: 这是产品的核心壁垒。归因系统是将"评论分类"升级为"决策系统"的关键桥梁。当前 `content_comment_attribution_agent` 在 agents.mjs 中仅有Agent定义，没有任何实现逻辑。

**具体行动**:
- 创建 `backend/src/attribution-engine.mjs`：实现6步归因推理流程
- 定义 attribution 输入/输出 Schema（确保Agent输出结构化、可验证）
- 实现 `/api/tasks/:id/attribution/run` 和 `/api/tasks/:id/attribution` API
- 前端 `AttributionWorkbench` 页面同步开发（BL-012）

### 3. [高优先] 内容生产卡系统 (BL-008+BL-009)

**为什么先做**: 这是产品面向客户的最终交付物。生产卡将归因结果转化为可执行的脚本/文案/素材规格，是"No-AI能力"的关键体现（不需要客户懂AI，直接拿走可执行方案）。

**具体行动**:
- 创建 `content_production_cards` 表和21字段Schema
- 实现 `production_card_agent` 的Prompt（基于归因结果+平台方法论，生成差异化生产卡）
- 实现9项质检逻辑
- 前端 `ProductionCardsPage` 同步开发

### 4. [中优先] 品牌档案与品类关联 (BL-002+BL-014)

**为什么先做**: 品牌档案是任务创建的上游，也是多品牌管理的基础。虽然当前只有单品牌demo，但数据模型必须先建设，否则后续多品牌切换无法实施。

### 5. [中优先] 报告导出增强 + 平台方法论 (BL-010+BL-006)

**为什么先做**: 报告导出是面向客户的"最后一公里"。当前系统只能导出Markdown和HTML，需要补齐PDF+Excel+多格式报告包。平台方法论在生产卡生成之前就需要就位。

---

## 附录：模块完整度评分

| 模块 | 蓝图定义 | 当前完成度 | 阶段1目标 | 核心缺失 |
|------|---------|-----------|----------|---------|
| 1-账号/团队/项目 | 团队空间、项目管理、品牌档案、品类选择 | 30% | 70% | 品牌档案UI、品类系统、多项目管理UI |
| 2-任务创建 | 平台/链接/文件/字段映射/内容目标 | 50% | 90% | 平台选择、内容目标、链接输入 |
| 3-原内容理解 | 9维分析Agent | 70% | 85% | 品类知识集成 |
| 4-评论清洗 | 去重/水军/引流/回复链/短评论保留 | 40% | 80% | 完整清洗管线（回复链重组、引流检测） |
| 5-高价值评论识别 | 12种评论类型 | 70% | 85% | 13维标签体系基本覆盖，需增强评分模型 |
| 6-内容-评论归因 | 归因维度+品类判断 | **0%** | **90%** | **完全缺失，需从零构建** |
| 7-需求/障碍地图 | 6需求+7障碍 | 30% | 80% | 前端有页面但后端无归因数据支撑 |
| 8-平台策略生成 | 抖音/小红书差异化 | 40% | 85% | Agent已定义但Prompt未差异化 |
| 9-内容生产卡 | 21字段+7验收标准 | **0%** | **85%** | **完全缺失** |
| 10-评论区运营 | 置顶/回复/引导/私信 | **0%** | 20% | 阶段2实现 |
| 11-投流适配 | 9维评分 | **0%** | 20% | 阶段2实现 |
| 12-发布前质检 | 9项检查 | **0%** | **80%** | **完全缺失** |
| 13-发布后复盘 | 数据闭环 | **0%** | 10% | 阶段2实现 |
| 14-报告导出 | 6格式+7报告类型 | 30% | 75% | 缺PDF/Excel/多格式包 |
| 15-AI工程治理 | 8项治理能力 | 70% | 80% | 基本完善，需持续优化 |

**总体评估**: 当前系统完成度约 **28%**（按模块加权），阶段1目标完成度 **68%**。
