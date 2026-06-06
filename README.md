# Voice of Consumer OS (Vocos)

评论驱动的品牌内容投放决策系统 — 将抖音、小红书、B 站、视频号等平台评论区里的真实用户反馈，转化为品牌可执行的内容选题、卖点表达、脚本方向和投放策略。

## 项目结构

```
vocos/
├── backend/                  # Node.js Express 后端
│   ├── src/                  # 源代码
│   │   ├── server.mjs        # Express 入口
│   │   ├── agents.mjs        # Agent 注册表
│   │   ├── store.mjs         # SQLite 数据层
│   │   ├── model-gateway.mjs # 多模型网关
│   │   ├── model-adapters.mjs# 模型适配器
│   │   ├── schemas.mjs       # Schema + Prompt
│   │   ├── schema-validator.mjs # JSON Schema 验证
│   │   ├── state-machine.mjs # 任务状态机
│   │   ├── comment-insights.mjs # 13 维标签
│   │   ├── import-service.mjs   # 评论导入
│   │   ├── auth.mjs          # RBAC 认证
│   │   ├── cost-governance.mjs  # 成本治理
│   │   ├── quality-governance.mjs # 质量治理
│   │   ├── report-generator.mjs  # 报告生成
│   │   ├── export-client.mjs     # Python 微服务客户端
│   │   └── middleware/       # 中间件
│   ├── db/                   # 数据库 Schema + 迁移
│   ├── data/                 # SQLite 数据库文件
│   ├── tests/                # 测试
│   └── package.json
├── frontend/                 # React + Vite 前端
│   ├── src/
│   │   ├── features/         # 按页面组织
│   │   ├── shared/           # 通用组件/hooks/services
│   │   ├── App.tsx           # 路由 + 布局
│   │   └── main.tsx          # 入口
│   └── package.json
├── docs/                     # 项目文档
│   ├── PRD-REFACTOR-INCREMENTAL.md
│   ├── ARCHITECTURE-REFACTOR.md
│   └── TASKS-REFACTOR.md
└── README.md
```

## 快速开始

### 后端

```bash
cd backend
cp .env.example .env    # 编辑 .env 填写配置
npm install
npm run dev             # 启动开发服务器 → http://localhost:3000
```

验证：`curl http://localhost:3000/health` → `{"status":"ok","version":"0.1.0",...}`

### 前端

```bash
cd frontend
npm install
npm run dev             # 启动开发服务器 → http://localhost:5173
```

## 技术栈

| 层面 | 选型 |
|------|------|
| 后端运行时 | Node.js 22+ |
| Web 框架 | Express 4.x |
| 数据库 | better-sqlite3 (WAL 模式) |
| 前端框架 | React 18 + TypeScript 5 |
| 构建工具 | Vite 5 |
| 组件库 | MUI 6 Material UI |
| 样式 | Tailwind CSS 4 |
| 状态管理 | Zustand 4.5 |
| 本地缓存 | Dexie.js 4.x |
| 路由 | React Router 6.x |
| 图表 | Recharts 2.x |
