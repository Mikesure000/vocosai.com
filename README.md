# Voice of Consumer OS

评论驱动的品牌内容投放决策系统 — 将抖音、小红书、B站、视频号等平台评论区里的真实用户反馈，转化为品牌可执行的内容选题、卖点表达、脚本方向和投放策略。

## 项目结构

```
voice-of-consumer/
├── index.html              # 主应用（单文件 SPA，打开即用）
├── sample_comments.csv     # 示例评论数据（CSV 格式）
├── sample_comments.json    # 示例评论数据（JSON 格式）
└── README.md               # 本文件
```

## 功能模块

| 分组 | 页面 | 说明 |
|------|------|------|
| 决策中心 | 本周决策台 | 本周 Top 5 内容投放建议动作 |
| 数据洞察 | 评论信号池 | 多平台评论导入、筛选、分析 |
| | 用户需求地图 | AI 识别的用户需求分类与趋势 |
| | 购买障碍地图 | 8 类购买障碍分布与解决方案 |
| | 竞品机会地图 | 竞品评论区信号与切入机会 |
| 内容策略 | 小红书策略卡 | 平台专属内容策略（封面/标题/正文/标签） |
| | 抖音策略卡 | 平台专属脚本（钩子/分镜/BGM/达人匹配） |
| 执行工具 | 内容实验室 | A/B 测试方案设计与管理 |
| | 复盘归因中心 | 投放结果归因分析与优化建议 |
| | 报告中心 | 多类型报告自动生成 |
| 知识资产 | 品牌中心 | 自身品牌/产品知识库（可编辑+AI 生成） |
| | 对标中心 | 竞品对标知识库（可编辑+AI 生成） |
| AI 引擎 | AI 分析中心 | 评论清洗→语义分析→洞察聚类→策略生成 |
| | 系统设置 | API 配置、存储管理、调用日志 |

## 快速开始

```bash
# 克隆项目
git clone <repo-url>
cd voice-of-consumer

# 方式一：直接用浏览器打开
open index.html

# 方式二：启动本地服务器
python3 -m http.server 8080
# 然后打开 http://localhost:8080
```

## AI 模型配置

1. 打开侧边栏底部「系统设置」
2. 选择模型平台（DeepSeek 推荐，免费额度）
3. 填写 API Key → 测试连接 → 保存
4. 即可使用 AI 分析中心、品牌 AI 生成等所有 AI 功能

## 支持的评论导入格式

- `.xlsx` / `.xls` — 直接从抖音社媒助手导出的 Excel
- `.csv` — 逗号或制表符分隔
- `.json` — JSON 数组格式
- 粘贴导入 — CSV/JSON/纯文本

### 评论字段（自动识别中英文列名）

评论ID、评论内容、点赞量、评论时间、IP地址、子评论数、视频ID、视频链接、用户UID、用户链接、用户名称、抖音号、一级评论ID、一级评论内容、一级评论用户UID、一级评论用户名称、引用的评论ID、引用的评论内容、引用的用户UID、引用的用户名称

## 技术栈

- 纯前端：HTML + CSS + JavaScript
- UI 框架：Tailwind CSS (CDN)
- Excel 解析：SheetJS (CDN)
- 加密：CryptoJS AES-256 (CDN)
- AI API：DeepSeek / OpenAI / 自定义兼容端点

## 数据持久化

- API Key：AES-256 加密后存入 localStorage
- 品牌/竞品编辑数据：localStorage 自动保存
- 导入的评论数据：当前会话有效（刷新后需重新导入，可导出备份）

## 后续迁移

当前为纯前端原型。迁移至 Laravel + Livewire + SQLite 时：
1. HTML 模板拆分为 Blade 组件
2. 数据迁移至 SQLite + Eloquent Models
3. 交互逻辑迁移至 Livewire 组件
4. API Key 管理迁移至服务端加密存储
