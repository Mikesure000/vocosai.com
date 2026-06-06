// 数据层 —— better-sqlite3 封装，双模式 JSON collections + 关系表同步
// 移植自 Codex E:/codex/vocosai/backend/src/store.mjs
// 关键适配：better-sqlite3 替代 node:sqlite

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import Database from "better-sqlite3";
import {
  migrateSqliteRelational,
  replaceRelationalCollection,
  upsertRelationalRecord,
  getSqliteRelationalDiagnostics
} from "./sqlite-relational.mjs";
import { AGENTS } from "./agents.mjs";
import { AI_SCHEMAS, AI_PROMPTS } from "./schemas.mjs";

// 从 seed.json 加载基础种子数据，agents/schemas/prompts 从源码模块合并
let _cachedSeed = null;

function loadSeedData() {
  if (_cachedSeed) return _cachedSeed;
  const seedPath = "db/seed.json";
  let base = null;
  if (existsSync(seedPath)) {
    base = JSON.parse(readFileSync(seedPath, "utf8"));
  } else {
    base = {
      users: [], teams: [], teamMembers: [], projects: [],
      tasks: [], commentFiles: [], comments: [], aiRuns: [],
      aiQualityFeedback: [], auditLogs: [], reports: [],
      modelProviders: [], modelConfigs: [],
      agents: [], aiSchemas: [], aiPrompts: []
    };
  }
  // 从源码模块合并 agents、schemas、prompts（这些在 seed.json 中为空，由源码定义）
  _cachedSeed = {
    ...base,
    agents: AGENTS,
    aiSchemas: AI_SCHEMAS,
    aiPrompts: AI_PROMPTS
  };
  return _cachedSeed;
}

export function now() {
  return new Date().toISOString();
}

export function createId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function createStore(opts = {}) {
  const { dbPath = "backend/data/vocos.sqlite" } = opts;

  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);

  // WAL 模式 + 外键
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // 创建 collections 表（JSON 存储层）
  db.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      name TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 初始化 collections 种子数据
  initializeSqliteCollections(db);
  // 迁移关系表
  migrateSqliteRelational(db);
  // 回填关系表数据
  backfillSqliteRelational(db);

  return {
    snapshot() {
      const rows = db.prepare("SELECT name, json FROM collections").all();
      return Object.fromEntries(rows.map((row) => [row.name, JSON.parse(row.json)]));
    },

    list(collection) {
      return getSqliteCollection(db, collection);
    },

    get(collection, id) {
      return getSqliteCollection(db, collection).find((record) => record.id === id) ?? null;
    },

    find(collection, predicate) {
      return getSqliteCollection(db, collection).find(predicate) ?? null;
    },

    storageDiagnostics() {
      return {
        driver: "sqlite",
        checkedAt: now(),
        ...getSqliteRelationalDiagnostics(db)
      };
    },

    listTasks({ teamId, includeAllTeams = false } = {}) {
      const where = [];
      const values = [];
      if (!includeAllTeams && teamId) {
        where.push("team_id = ?");
        values.push(teamId);
      }
      const sql = `
        SELECT *
        FROM analysis_tasks
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY created_at ASC
      `;
      return db.prepare(sql).all(...values).map(rowToTask);
    },

    listAiRuns({ teamId, includeAllTeams = false, filters = {}, limit = 50 } = {}) {
      const where = [];
      const values = [];
      if (!includeAllTeams && teamId) {
        where.push("team_id = ?");
        values.push(teamId);
      }
      if (filters.taskId) {
        where.push("task_id = ?");
        values.push(filters.taskId);
      }
      if (filters.status) {
        where.push("status = ?");
        values.push(filters.status);
      }
      if (filters.providerName) {
        where.push("provider_name = ?");
        values.push(filters.providerName);
      }
      if (filters.executionMode) {
        where.push("execution_mode = ?");
        values.push(filters.executionMode);
      }
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const total = db.prepare(`SELECT COUNT(*) AS total FROM ai_runs ${whereSql}`).get(...values).total;
      const rows = db.prepare(`
        SELECT *
        FROM ai_runs
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT ?
      `).all(...values, limit);
      return {
        records: rows.map(rowToAiRun),
        total
      };
    },

    getTaskAssociations(taskId) {
      return {
        commentFiles: db.prepare(`
          SELECT *
          FROM comment_files
          WHERE task_id = ?
          ORDER BY created_at ASC
        `).all(taskId).map(rowToCommentFile),
        commentsCount: db.prepare("SELECT COUNT(*) AS count FROM comments WHERE task_id = ?").get(taskId).count,
        aiRunsCount: db.prepare("SELECT COUNT(*) AS count FROM ai_runs WHERE task_id = ?").get(taskId).count,
        reportsCount: db.prepare("SELECT COUNT(*) AS count FROM reports WHERE task_id = ?").get(taskId).count
      };
    },

    getPipelineJob(taskId) {
      const row = db.prepare("SELECT * FROM task_pipeline_jobs WHERE task_id = ?").get(taskId);
      return row ? rowToPipelineJob(row) : null;
    },

    async savePipelineJob(record) {
      const saved = normalizePipelineJob(record);
      db.prepare(`
        INSERT INTO task_pipeline_jobs (
          task_id, status, started_at, completed_at,
          completed_agents, total_agents, error, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          status = excluded.status,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          completed_agents = excluded.completed_agents,
          total_agents = excluded.total_agents,
          error = excluded.error,
          updated_at = excluded.updated_at
      `).run(
        saved.taskId, saved.status, saved.startedAt, saved.completedAt,
        saved.completedAgents, saved.totalAgents, saved.error, saved.updatedAt
      );
      return saved;
    },

    async markInterruptedPipelineJobs() {
      const interruptedAt = now();
      const runningRows = db.prepare(`
        SELECT task_id
        FROM task_pipeline_jobs
        WHERE status IN ('queued', 'running')
      `).all();

      for (const row of runningRows) {
        const runsCount = db.prepare("SELECT COUNT(*) AS count FROM ai_runs WHERE task_id = ?").get(row.task_id).count;
        const nextTaskStatus = runsCount > 0 ? "partially_failed" : "failed";
        const tasks = getSqliteCollection(db, "tasks");
        const taskIndex = tasks.findIndex((task) => task.id === row.task_id && task.status === "analyzing");
        if (taskIndex !== -1) {
          tasks[taskIndex] = {
            ...tasks[taskIndex],
            status: nextTaskStatus,
            completedAt: interruptedAt,
            updatedAt: interruptedAt
          };
          setSqliteCollection(db, "tasks", tasks);
        }
        db.prepare(`
          UPDATE task_pipeline_jobs
          SET status = 'interrupted', completed_at = ?, error = ?, updated_at = ?
          WHERE task_id = ?
        `).run(interruptedAt, "Server restarted before pipeline completed", interruptedAt, row.task_id);
        db.prepare(`
          UPDATE analysis_tasks
          SET status = ?, completed_at = ?, updated_at = ?
          WHERE id = ? AND status = 'analyzing'
        `).run(nextTaskStatus, interruptedAt, interruptedAt, row.task_id);
      }

      return runningRows.length;
    },

    async insert(collection, record) {
      const records = getSqliteCollection(db, collection);
      records.push(record);
      setSqliteCollection(db, collection, records);
      upsertRelationalRecord(db, collection, record);
      return record;
    },

    async insertMany(collection, records) {
      const existing = getSqliteCollection(db, collection);
      existing.push(...records);
      setSqliteCollection(db, collection, existing);
      for (const record of records) upsertRelationalRecord(db, collection, record);
      return records;
    },

    async update(collection, id, patch) {
      const records = getSqliteCollection(db, collection);
      const index = records.findIndex((record) => record.id === id);
      if (index === -1) return null;
      records[index] = { ...records[index], ...patch, updatedAt: now() };
      setSqliteCollection(db, collection, records);
      upsertRelationalRecord(db, collection, records[index]);
      return records[index];
    },

    async replaceAll(collection, records) {
      setSqliteCollection(db, collection, records);
      replaceRelationalCollection(db, collection, records);
      return records;
    }
  };
}

function initializeSqliteCollections(db) {
  const seedData = loadSeedData();
  const nowValue = now();
  const insert = db.prepare("INSERT INTO collections (name, json, updated_at) VALUES (?, ?, ?)");
  const select = db.prepare("SELECT json FROM collections WHERE name = ?");

  for (const [collection, records] of Object.entries(seedData)) {
    const row = select.get(collection);
    if (!row) {
      insert.run(collection, JSON.stringify(records, null, 2), nowValue);
    }
  }
}

function getSqliteCollection(db, collection) {
  const row = db.prepare("SELECT json FROM collections WHERE name = ?").get(collection);
  if (!row) return [];
  return JSON.parse(row.json);
}

function setSqliteCollection(db, collection, records) {
  db.prepare(`
    INSERT INTO collections (name, json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
  `).run(collection, JSON.stringify(records, null, 2), now());
}

function backfillSqliteRelational(db) {
  const rows = db.prepare("SELECT name, json FROM collections").all();
  const transaction = db.transaction(() => {
    for (const row of rows) {
      replaceRelationalCollection(db, row.name, JSON.parse(row.json));
    }
  });
  transaction();
}

// --- Row mappers ---

function rowToTask(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    projectId: row.project_id,
    taskName: row.task_name,
    platform: row.platform,
    contentUrl: row.content_url ?? "",
    contentTitle: row.content_title,
    contentBody: row.content_body ?? "",
    contentGoal: row.content_goal ?? "unknown",
    brandInfo: row.brand_info ?? "",
    productInfo: row.product_info ?? "",
    competitorInfo: row.competitor_info ?? "",
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at
  };
}

function rowToCommentFile(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    fileName: row.file_name,
    storageUrl: row.storage_url,
    fileType: row.file_type,
    fileSize: row.file_size,
    rowCount: row.row_count,
    mappingConfig: parseSqliteJson(row.mapping_config, null),
    parseStatus: row.parse_status,
    rawContent: row.raw_content,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToPipelineJob(row) {
  return {
    taskId: row.task_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    completedAgents: row.completed_agents ?? 0,
    totalAgents: row.total_agents ?? 0,
    error: row.error,
    updatedAt: row.updated_at
  };
}

function normalizePipelineJob(record) {
  const timestamp = now();
  return {
    taskId: record.taskId,
    status: record.status ?? "running",
    startedAt: record.startedAt ?? timestamp,
    completedAt: record.completedAt ?? null,
    completedAgents: record.completedAgents ?? 0,
    totalAgents: record.totalAgents ?? 0,
    error: record.error ?? null,
    updatedAt: timestamp
  };
}

function rowToAiRun(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    projectId: row.project_id,
    taskId: row.task_id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    agentVersion: row.agent_version,
    promptId: row.prompt_id,
    promptVersion: row.prompt_version,
    schemaId: row.schema_id,
    providerName: row.provider_name,
    modelName: row.model_name,
    modelRouteRuleId: row.model_route_rule_id,
    executionMode: row.execution_mode,
    inputTokenCount: row.input_token_count,
    outputTokenCount: row.output_token_count,
    totalTokenCount: row.total_token_count,
    estimatedCost: row.estimated_cost,
    actualCost: row.actual_cost,
    latencyMs: row.latency_ms,
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    warningCode: row.warning_code,
    warningMessage: row.warning_message,
    retryCount: row.retry_count,
    retryOfRunId: row.retry_of_run_id,
    fallbackUsed: Boolean(row.fallback_used),
    fallbackReason: row.fallback_reason,
    providerAttempts: parseSqliteJson(row.provider_attempts, []),
    jsonRepairUsed: Boolean(row.json_repair_used),
    inputHash: row.input_hash,
    outputRaw: row.output_raw,
    outputJson: parseSqliteJson(row.output_json, null),
    schemaValidationStatus: row.schema_validation_status,
    schemaValidationErrors: parseSqliteJson(row.schema_validation_errors, []),
    costPolicyDecision: row.cost_policy_decision,
    costPolicyReason: row.cost_policy_reason,
    costPolicySnapshot: parseSqliteJson(row.cost_policy_snapshot, null),
    createdAt: row.created_at,
    completedAt: row.completed_at,
    createdBy: row.created_by
  };
}

function parseSqliteJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
