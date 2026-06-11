// SQLite 关系表映射 —— collections.json → relational tables 同步
// 移植自 Codex E:/codex/vocosai/backend/src/sqlite-relational.mjs
// 适配 better-sqlite3 API（与 node:sqlite 兼容的 prepare/all/get/run/exec API）

const COLLECTION_TABLES = [
  {
    collection: "users",
    table: "users",
    columns: {
      id: "TEXT PRIMARY KEY",
      name: "TEXT NOT NULL",
      email: "TEXT",
      phone: "TEXT",
      password_hash: "TEXT",
      avatar_url: "TEXT",
      role: "TEXT",
      status: "TEXT NOT NULL DEFAULT 'active'",
      created_at: "TEXT NOT NULL",
      updated_at: "TEXT NOT NULL"
    },
    map: (record) => ({
      id: record.id,
      name: record.name,
      email: record.email,
      phone: record.phone,
      password_hash: record.passwordHash,
      avatar_url: record.avatarUrl,
      role: record.role,
      status: record.status ?? "active",
      created_at: record.createdAt,
      updated_at: record.updatedAt ?? record.createdAt
    })
  },
  {
    collection: "teams",
    table: "teams",
    columns: {
      id: "TEXT PRIMARY KEY",
      team_name: "TEXT NOT NULL",
      owner_user_id: "TEXT",
      plan_type: "TEXT",
      monthly_quota: "REAL DEFAULT 0",
      used_quota: "REAL DEFAULT 0",
      status: "TEXT NOT NULL DEFAULT 'active'",
      created_at: "TEXT NOT NULL",
      updated_at: "TEXT NOT NULL"
    },
    map: (record) => ({
      id: record.id,
      team_name: record.name ?? record.teamName,
      owner_user_id: record.ownerUserId,
      plan_type: record.planType,
      monthly_quota: record.monthlyQuota ?? 0,
      used_quota: record.usedQuota ?? 0,
      status: record.status ?? "active",
      created_at: record.createdAt,
      updated_at: record.updatedAt ?? record.createdAt
    })
  },
  {
    collection: "teamMembers",
    table: "team_members",
    columns: {
      id: "TEXT PRIMARY KEY",
      team_id: "TEXT NOT NULL",
      user_id: "TEXT NOT NULL",
      role: "TEXT NOT NULL",
      status: "TEXT NOT NULL DEFAULT 'active'",
      created_at: "TEXT NOT NULL",
      updated_at: "TEXT NOT NULL"
    },
    map: (record) => ({
      id: record.id,
      team_id: record.teamId,
      user_id: record.userId,
      role: record.role,
      status: record.status ?? "active",
      created_at: record.createdAt,
      updated_at: record.updatedAt ?? record.createdAt
    })
  },
  {
    collection: "projects",
    table: "projects",
    columns: {
      id: "TEXT PRIMARY KEY",
      team_id: "TEXT NOT NULL",
      project_name: "TEXT NOT NULL",
      brand_name: "TEXT",
      product_name: "TEXT",
      industry: "TEXT",
      description: "TEXT",
      status: "TEXT NOT NULL DEFAULT 'active'",
      created_by: "TEXT",
      created_at: "TEXT NOT NULL",
      updated_at: "TEXT NOT NULL"
    },
    map: (record) => ({
      id: record.id,
      team_id: record.teamId,
      project_name: record.name ?? record.projectName,
      brand_name: record.brandName,
      product_name: record.productName,
      industry: record.industry,
      description: record.description,
      status: record.status ?? "active",
      created_by: record.createdBy,
      created_at: record.createdAt,
      updated_at: record.updatedAt ?? record.createdAt
    })
  },
  {
    collection: "tasks",
    table: "analysis_tasks",
    columns: {
      id: "TEXT PRIMARY KEY",
      team_id: "TEXT NOT NULL",
      project_id: "TEXT NOT NULL",
      task_name: "TEXT NOT NULL",
      platform: "TEXT NOT NULL",
      content_url: "TEXT",
      content_title: "TEXT NOT NULL",
      content_body: "TEXT",
      content_goal: "TEXT",
      brand_info: "TEXT",
      product_info: "TEXT",
      competitor_info: "TEXT",
      status: "TEXT NOT NULL DEFAULT 'draft'",
      created_by: "TEXT",
      created_at: "TEXT NOT NULL",
      updated_at: "TEXT NOT NULL",
      started_at: "TEXT",
      completed_at: "TEXT"
    },
    map: (record) => ({
      id: record.id,
      team_id: record.teamId,
      project_id: record.projectId,
      task_name: record.taskName,
      platform: record.platform,
      content_url: record.contentUrl,
      content_title: record.contentTitle,
      content_body: record.contentBody,
      content_goal: record.contentGoal,
      brand_info: record.brandInfo,
      product_info: record.productInfo,
      competitor_info: record.competitorInfo,
      status: record.status ?? "draft",
      created_by: record.createdBy,
      created_at: record.createdAt,
      updated_at: record.updatedAt ?? record.createdAt,
      started_at: record.startedAt,
      completed_at: record.completedAt
    })
  },
  {
    collection: "commentFiles",
    table: "comment_files",
    columns: {
      id: "TEXT PRIMARY KEY",
      task_id: "TEXT NOT NULL",
      file_name: "TEXT NOT NULL",
      storage_url: "TEXT",
      file_type: "TEXT",
      file_size: "INTEGER",
      row_count: "INTEGER",
      mapping_config: "TEXT",
      parse_status: "TEXT NOT NULL DEFAULT 'uploaded'",
      raw_content: "TEXT",
      created_at: "TEXT NOT NULL",
      updated_at: "TEXT NOT NULL"
    },
    map: (record) => ({
      id: record.id,
      task_id: record.taskId,
      file_name: record.fileName,
      storage_url: record.storageUrl,
      file_type: record.fileType,
      file_size: record.fileSize,
      row_count: record.rowCount,
      mapping_config: toJson(record.mappingConfig),
      parse_status: record.parseStatus ?? "uploaded",
      raw_content: record.rawContent,
      created_at: record.createdAt,
      updated_at: record.updatedAt ?? record.createdAt
    })
  },
  {
    collection: "comments",
    table: "comments",
    columns: {
      id: "TEXT PRIMARY KEY",
      task_id: "TEXT NOT NULL",
      comment_file_id: "TEXT",
      comment_id_external: "TEXT",
      parent_comment_id: "TEXT",
      reply_to_comment_id: "TEXT",
      user_id_hash: "TEXT",
      user_name_hash: "TEXT",
      comment_text: "TEXT NOT NULL",
      normalized_text: "TEXT",
      like_count: "INTEGER DEFAULT 0",
      created_at_external: "TEXT",
      is_author_reply: "INTEGER DEFAULT 0",
      source_hash: "TEXT",
      clean_status: "TEXT DEFAULT 'raw'",
      value_score: "REAL",
      sentiment_label: "TEXT",
      intent_label: "TEXT",
      created_at: "TEXT NOT NULL"
    },
    map: (record) => ({
      id: record.id,
      task_id: record.taskId,
      comment_file_id: record.commentFileId,
      comment_id_external: record.commentIdExternal,
      parent_comment_id: record.parentCommentId,
      reply_to_comment_id: record.replyToCommentId,
      user_id_hash: record.userIdHash,
      user_name_hash: record.userNameHash,
      comment_text: record.commentText,
      normalized_text: record.normalizedText,
      like_count: record.likeCount ?? 0,
      created_at_external: record.createdAtExternal,
      is_author_reply: toIntegerBoolean(record.isAuthorReply),
      source_hash: record.sourceHash,
      clean_status: record.cleanStatus ?? "raw",
      value_score: record.valueScore,
      sentiment_label: record.sentimentLabel,
      intent_label: record.intentLabel,
      created_at: record.createdAt
    })
  },
  {
    collection: "modelProviders",
    table: "model_providers",
    columns: {
      id: "TEXT PRIMARY KEY",
      provider_name: "TEXT NOT NULL",
      base_url: "TEXT NOT NULL",
      api_key_encrypted: "TEXT",
      api_key_masked: "TEXT",
      key_updated_at: "TEXT",
      key_updated_by: "TEXT",
      status: "TEXT NOT NULL DEFAULT 'disabled'",
      created_at: "TEXT NOT NULL",
      updated_at: "TEXT NOT NULL"
    },
    map: (record) => ({
      id: record.id,
      provider_name: record.providerName,
      base_url: record.baseUrl,
      api_key_encrypted: record.apiKeyEncrypted,
      api_key_masked: record.apiKeyMasked,
      key_updated_at: record.keyUpdatedAt,
      key_updated_by: record.keyUpdatedBy,
      status: record.status ?? "disabled",
      created_at: record.createdAt,
      updated_at: record.updatedAt ?? record.createdAt
    })
  },
  {
    collection: "modelConfigs",
    table: "model_configs",
    columns: {
      id: "TEXT PRIMARY KEY",
      provider_id: "TEXT NOT NULL",
      model_name: "TEXT NOT NULL",
      model_type: "TEXT",
      context_window: "INTEGER",
      input_token_price: "REAL",
      output_token_price: "REAL",
      rate_limit_per_minute: "INTEGER",
      timeout_seconds: "INTEGER",
      is_active: "INTEGER DEFAULT 1",
      created_at: "TEXT NOT NULL",
      updated_at: "TEXT NOT NULL"
    },
    map: (record) => ({
      id: record.id,
      provider_id: record.providerId,
      model_name: record.modelName,
      model_type: record.modelType,
      context_window: record.contextWindow,
      input_token_price: record.inputTokenPrice,
      output_token_price: record.outputTokenPrice,
      rate_limit_per_minute: record.rateLimitPerMinute,
      timeout_seconds: record.timeoutSeconds,
      is_active: toIntegerBoolean(record.isActive ?? true),
      created_at: record.createdAt,
      updated_at: record.updatedAt ?? record.createdAt
    })
  },
  {
    collection: "agents",
    table: "ai_agents",
    columns: {
      id: "TEXT PRIMARY KEY",
      agent_name: "TEXT NOT NULL",
      agent_code: "TEXT NOT NULL UNIQUE",
      agent_version: "TEXT NOT NULL",
      description: "TEXT",
      input_schema_id: "TEXT",
      output_schema_id: "TEXT",
      default_prompt_id: "TEXT",
      default_model: "TEXT",
      fallback_model: "TEXT",
      max_retries: "INTEGER",
      timeout_seconds: "INTEGER",
      cost_limit: "REAL",
      status: "TEXT NOT NULL DEFAULT 'active'",
      created_at: "TEXT NOT NULL",
      updated_at: "TEXT NOT NULL"
    },
    map: (record) => ({
      id: record.id,
      agent_name: record.name,
      agent_code: record.code,
      agent_version: record.version,
      description: record.description,
      input_schema_id: record.inputSchemaId,
      output_schema_id: record.outputSchemaId,
      default_prompt_id: record.defaultPromptId,
      default_model: record.defaultModel,
      fallback_model: record.fallbackModel,
      max_retries: record.maxRetries,
      timeout_seconds: record.timeoutSeconds,
      cost_limit: record.costLimit,
      status: record.status ?? "active",
      created_at: record.createdAt,
      updated_at: record.updatedAt ?? record.createdAt
    })
  },
  {
    collection: "aiSchemas",
    table: "ai_schemas",
    columns: {
      id: "TEXT PRIMARY KEY",
      schema_name: "TEXT NOT NULL",
      schema_version: "TEXT NOT NULL",
      schema_json: "TEXT NOT NULL",
      status: "TEXT NOT NULL DEFAULT 'active'",
      created_at: "TEXT NOT NULL",
      updated_at: "TEXT NOT NULL"
    },
    map: (record) => ({
      id: record.id,
      schema_name: record.name,
      schema_version: record.version,
      schema_json: toJson(record.schema),
      status: record.status ?? "active",
      created_at: record.createdAt,
      updated_at: record.updatedAt ?? record.createdAt
    })
  },
  {
    collection: "aiRuns",
    table: "ai_runs",
    columns: {
      id: "TEXT PRIMARY KEY",
      team_id: "TEXT NOT NULL",
      project_id: "TEXT NOT NULL",
      task_id: "TEXT NOT NULL",
      agent_id: "TEXT NOT NULL",
      agent_name: "TEXT NOT NULL",
      agent_version: "TEXT",
      prompt_id: "TEXT",
      prompt_version: "TEXT",
      schema_id: "TEXT",
      provider_name: "TEXT NOT NULL",
      model_name: "TEXT NOT NULL",
      model_route_rule_id: "TEXT",
      execution_mode: "TEXT NOT NULL DEFAULT 'mock'",
      input_token_count: "INTEGER NOT NULL DEFAULT 0",
      output_token_count: "INTEGER NOT NULL DEFAULT 0",
      total_token_count: "INTEGER NOT NULL DEFAULT 0",
      estimated_cost: "REAL NOT NULL DEFAULT 0",
      actual_cost: "REAL NOT NULL DEFAULT 0",
      latency_ms: "INTEGER",
      status: "TEXT NOT NULL",
      error_code: "TEXT",
      error_message: "TEXT",
      warning_code: "TEXT",
      warning_message: "TEXT",
      retry_count: "INTEGER NOT NULL DEFAULT 0",
      retry_of_run_id: "TEXT",
      fallback_used: "INTEGER NOT NULL DEFAULT 0",
      fallback_reason: "TEXT",
      provider_attempts: "TEXT",
      json_repair_used: "INTEGER NOT NULL DEFAULT 0",
      input_hash: "TEXT",
      output_raw: "TEXT",
      output_json: "TEXT",
      schema_validation_status: "TEXT",
      schema_validation_errors: "TEXT",
      cost_policy_decision: "TEXT",
      cost_policy_reason: "TEXT",
      cost_policy_snapshot: "TEXT",
      created_at: "TEXT NOT NULL",
      completed_at: "TEXT",
      created_by: "TEXT"
    },
    map: (record) => ({
      id: record.id,
      team_id: record.teamId,
      project_id: record.projectId,
      task_id: record.taskId,
      agent_id: record.agentId,
      agent_name: record.agentName,
      agent_version: record.agentVersion,
      prompt_id: record.promptId,
      prompt_version: record.promptVersion,
      schema_id: record.schemaId,
      provider_name: record.providerName,
      model_name: record.modelName,
      model_route_rule_id: record.modelRouteRuleId,
      execution_mode: record.executionMode ?? "mock",
      input_token_count: record.inputTokenCount ?? 0,
      output_token_count: record.outputTokenCount ?? 0,
      total_token_count: record.totalTokenCount ?? 0,
      estimated_cost: record.estimatedCost ?? 0,
      actual_cost: record.actualCost ?? 0,
      latency_ms: record.latencyMs,
      status: record.status,
      error_code: record.errorCode,
      error_message: record.errorMessage,
      warning_code: record.warningCode,
      warning_message: record.warningMessage,
      retry_count: record.retryCount ?? 0,
      retry_of_run_id: record.retryOfRunId,
      fallback_used: toIntegerBoolean(record.fallbackUsed),
      fallback_reason: record.fallbackReason,
      provider_attempts: toJson(record.providerAttempts),
      json_repair_used: toIntegerBoolean(record.jsonRepairUsed),
      input_hash: record.inputHash,
      output_raw: record.outputRaw,
      output_json: toJson(record.outputJson),
      schema_validation_status: record.schemaValidationStatus,
      schema_validation_errors: toJson(record.schemaValidationErrors),
      cost_policy_decision: record.costPolicyDecision,
      cost_policy_reason: record.costPolicyReason,
      cost_policy_snapshot: toJson(record.costPolicySnapshot),
      created_at: record.createdAt,
      completed_at: record.completedAt,
      created_by: record.createdBy
    })
  },
  {
    collection: "aiQualityFeedback",
    table: "ai_quality_feedback",
    columns: {
      id: "TEXT PRIMARY KEY",
      team_id: "TEXT NOT NULL",
      project_id: "TEXT",
      task_id: "TEXT",
      ai_run_id: "TEXT",
      agent_name: "TEXT",
      output_type: "TEXT",
      action: "TEXT NOT NULL",
      edit_distance_ratio: "REAL",
      rating: "INTEGER",
      comment: "TEXT",
      created_by: "TEXT",
      created_at: "TEXT NOT NULL"
    },
    map: (record) => ({
      id: record.id,
      team_id: record.teamId,
      project_id: record.projectId,
      task_id: record.taskId,
      ai_run_id: record.aiRunId,
      agent_name: record.agentName,
      output_type: record.outputType,
      action: record.action,
      edit_distance_ratio: record.editDistanceRatio,
      rating: record.rating,
      comment: record.comment,
      created_by: record.createdBy,
      created_at: record.createdAt
    })
  },
  {
    collection: "reports",
    table: "reports",
    columns: {
      id: "TEXT PRIMARY KEY",
      team_id: "TEXT NOT NULL",
      project_id: "TEXT NOT NULL",
      task_id: "TEXT NOT NULL",
      title: "TEXT NOT NULL",
      format: "TEXT NOT NULL DEFAULT 'markdown'",
      status: "TEXT NOT NULL DEFAULT 'generated'",
      summary: "TEXT",
      markdown: "TEXT",
      metrics: "TEXT",
      created_by: "TEXT",
      created_at: "TEXT NOT NULL",
      updated_at: "TEXT NOT NULL"
    },
    map: (record) => ({
      id: record.id,
      team_id: record.teamId,
      project_id: record.projectId,
      task_id: record.taskId,
      title: record.title,
      format: record.format ?? "markdown",
      status: record.status ?? "generated",
      summary: record.summary,
      markdown: record.markdown,
      metrics: toJson(record.metrics),
      created_by: record.createdBy,
      created_at: record.createdAt,
      updated_at: record.updatedAt ?? record.createdAt
    })
  },
  {
    collection: "auditLogs",
    table: "audit_logs",
    columns: {
      id: "TEXT PRIMARY KEY",
      team_id: "TEXT",
      user_id: "TEXT",
      role: "TEXT",
      action: "TEXT NOT NULL",
      resource_type: "TEXT NOT NULL",
      resource_id: "TEXT",
      metadata: "TEXT",
      created_at: "TEXT NOT NULL"
    },
    map: (record) => ({
      id: record.id,
      team_id: record.teamId,
      user_id: record.userId,
      role: record.role,
      action: record.action,
      resource_type: record.resourceType,
      resource_id: record.resourceId,
      metadata: toJson(record.metadata),
      created_at: record.createdAt
    })
  },
  {
    collection: "chatSessions",
    table: "chat_sessions",
    columns: {
      id: "TEXT PRIMARY KEY",
      user_id: "TEXT NOT NULL",
      team_id: "TEXT",
      provider_name: "TEXT",
      model_name: "TEXT",
      title: "TEXT",
      message_count: "INTEGER NOT NULL DEFAULT 0",
      last_message_at: "TEXT",
      created_at: "TEXT NOT NULL",
      updated_at: "TEXT NOT NULL"
    },
    map: (record) => ({
      id: record.id,
      user_id: record.userId,
      team_id: record.teamId,
      provider_name: record.providerName,
      model_name: record.modelName,
      title: record.title,
      message_count: record.messageCount ?? 0,
      last_message_at: record.lastMessageAt,
      created_at: record.createdAt,
      updated_at: record.updatedAt ?? record.createdAt
    })
  },
  {
    collection: "chatMessages",
    table: "chat_messages",
    columns: {
      id: "TEXT PRIMARY KEY",
      session_id: "TEXT NOT NULL",
      role: "TEXT NOT NULL",
      content: "TEXT NOT NULL",
      provider_name: "TEXT",
      model_name: "TEXT",
      token_count: "INTEGER DEFAULT 0",
      created_at: "TEXT NOT NULL"
    },
    map: (record) => ({
      id: record.id,
      session_id: record.sessionId,
      role: record.role,
      content: record.content,
      provider_name: record.providerName,
      model_name: record.modelName,
      token_count: record.tokenCount ?? 0,
      created_at: record.createdAt
    })
  }
];

const COLLECTION_TABLE_BY_NAME = new Map(COLLECTION_TABLES.map((definition) => [definition.collection, definition]));

const INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_analysis_tasks_project ON analysis_tasks(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_analysis_tasks_status ON analysis_tasks(status)",
  "CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id)",
  "CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id)",
  "CREATE INDEX IF NOT EXISTS idx_comments_clean_status ON comments(clean_status)",
  "CREATE INDEX IF NOT EXISTS idx_ai_runs_task ON ai_runs(task_id)",
  "CREATE INDEX IF NOT EXISTS idx_ai_runs_agent ON ai_runs(agent_name)",
  "CREATE INDEX IF NOT EXISTS idx_ai_runs_model ON ai_runs(provider_name, model_name)",
  "CREATE INDEX IF NOT EXISTS idx_ai_runs_status ON ai_runs(status)",
  "CREATE INDEX IF NOT EXISTS idx_ai_quality_feedback_run ON ai_quality_feedback(ai_run_id)",
  "CREATE INDEX IF NOT EXISTS idx_ai_quality_feedback_task ON ai_quality_feedback(task_id)",
  "CREATE INDEX IF NOT EXISTS idx_reports_task ON reports(task_id)",
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_team ON audit_logs(team_id)",
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_prompt ON ai_prompt_versions(prompt_id)",
  "CREATE INDEX IF NOT EXISTS idx_task_pipeline_jobs_status ON task_pipeline_jobs(status)",
  "CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at)",
  "CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)"
];

export function migrateSqliteRelational(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  for (const definition of COLLECTION_TABLES) {
    ensureTable(db, definition);
  }
  ensurePromptTables(db);
  ensurePipelineJobTable(db);
  for (const indexSql of INDEXES) db.exec(indexSql);

  db.prepare(`
    INSERT INTO schema_migrations (id, applied_at)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET applied_at = excluded.applied_at
  `).run("sqlite_relational_v1", new Date().toISOString());
}

export function replaceRelationalCollection(db, collection, records) {
  if (collection === "aiPrompts") {
    replacePromptRecords(db, records);
    return;
  }

  const definition = COLLECTION_TABLE_BY_NAME.get(collection);
  if (!definition) return;

  db.prepare(`DELETE FROM ${definition.table}`).run();
  for (const record of records) upsertWithDefinition(db, definition, record);
}

export function upsertRelationalRecord(db, collection, record) {
  if (collection === "aiPrompts") {
    upsertPromptRecord(db, record);
    return;
  }

  const definition = COLLECTION_TABLE_BY_NAME.get(collection);
  if (!definition) return;
  upsertWithDefinition(db, definition, record);
}

export function getSqliteRelationalDiagnostics(db) {
  const collectionRows = db.prepare("SELECT name, json FROM collections ORDER BY name").all();
  const collectionCounts = new Map(collectionRows.map((row) => [row.name, safeJsonArrayLength(row.json)]));
  const supportedCollections = [
    ...COLLECTION_TABLES.map((definition) => ({
      collection: definition.collection,
      table: definition.table
    })),
    {
      collection: "aiPrompts",
      table: "ai_prompts"
    }
  ].sort((a, b) => a.collection.localeCompare(b.collection));

  const collections = supportedCollections.map((item) => {
    const collectionCount = collectionCounts.get(item.collection) ?? 0;
    const relationalCount = countTableRows(db, item.table);
    return {
      collection: item.collection,
      collectionCount,
      relationalTable: item.table,
      relationalCount,
      consistent: collectionCount === relationalCount
    };
  });
  const childTables = [
    {
      table: "ai_prompt_versions",
      count: countTableRows(db, "ai_prompt_versions"),
      parentCollection: "aiPrompts"
    },
    {
      table: "task_pipeline_jobs",
      count: countTableRows(db, "task_pipeline_jobs"),
      parentCollection: "tasks"
    }
  ];
  const unsupportedCollections = [...collectionCounts.keys()]
    .filter((collection) => !supportedCollections.some((item) => item.collection === collection))
    .map((collection) => ({
      collection,
      collectionCount: collectionCounts.get(collection)
    }));
  const mismatches = collections.filter((item) => !item.consistent);

  return {
    status: mismatches.length === 0 ? "consistent" : "mismatch",
    tableCount: countSqliteTables(db),
    checkedCollections: collections.length,
    mismatchCount: mismatches.length,
    collections,
    childTables,
    unsupportedCollections,
    migrations: db.prepare("SELECT id, applied_at AS appliedAt FROM schema_migrations ORDER BY applied_at DESC").all()
  };
}

function ensureTable(db, definition) {
  const columnsSql = Object.entries(definition.columns)
    .map(([name, type]) => `${name} ${type}`)
    .join(",\n      ");
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${definition.table} (
      ${columnsSql}
    );
  `);
  ensureColumns(db, definition.table, definition.columns);
}

function ensurePromptTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_prompts (
      id TEXT PRIMARY KEY,
      agent_code TEXT NOT NULL,
      prompt_name TEXT NOT NULL,
      current_version_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      activated_by TEXT,
      activated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_prompt_versions (
      id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL,
      version TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      user_prompt_template TEXT NOT NULL,
      input_variables TEXT,
      output_schema_id TEXT,
      model_config_id TEXT,
      default_model TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_by TEXT,
      created_at TEXT NOT NULL,
      change_log TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_prompt ON ai_prompt_versions(prompt_id);
  `);

  ensureColumns(db, "ai_prompts", {
    id: "TEXT PRIMARY KEY",
    agent_code: "TEXT NOT NULL",
    prompt_name: "TEXT NOT NULL",
    current_version_id: "TEXT",
    status: "TEXT NOT NULL DEFAULT 'active'",
    created_at: "TEXT NOT NULL",
    updated_at: "TEXT NOT NULL",
    activated_by: "TEXT",
    activated_at: "TEXT"
  });
  ensureColumns(db, "ai_prompt_versions", {
    id: "TEXT PRIMARY KEY",
    prompt_id: "TEXT NOT NULL",
    version: "TEXT NOT NULL",
    system_prompt: "TEXT NOT NULL",
    user_prompt_template: "TEXT NOT NULL",
    input_variables: "TEXT",
    output_schema_id: "TEXT",
    model_config_id: "TEXT",
    default_model: "TEXT",
    status: "TEXT NOT NULL DEFAULT 'active'",
    created_by: "TEXT",
    created_at: "TEXT NOT NULL",
    change_log: "TEXT"
  });
}

function ensurePipelineJobTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_pipeline_jobs (
      task_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      completed_agents INTEGER NOT NULL DEFAULT 0,
      total_agents INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_task_pipeline_jobs_status ON task_pipeline_jobs(status);
  `);

  ensureColumns(db, "task_pipeline_jobs", {
    task_id: "TEXT PRIMARY KEY",
    status: "TEXT NOT NULL",
    started_at: "TEXT",
    completed_at: "TEXT",
    completed_agents: "INTEGER NOT NULL DEFAULT 0",
    total_agents: "INTEGER NOT NULL DEFAULT 0",
    error: "TEXT",
    updated_at: "TEXT NOT NULL"
  });

  // ======== 品类知识库 (category_knowledge) ========
  db.exec(`
    CREATE TABLE IF NOT EXISTS category_knowledge (
      id TEXT PRIMARY KEY,
      industry TEXT NOT NULL,
      category_name TEXT NOT NULL,
      need_taxonomy TEXT,
      barrier_taxonomy TEXT,
      audience_segments TEXT,
      competitor_benchmarks TEXT,
      platform_tactics TEXT,
      version TEXT DEFAULT '1.0.0',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_category_knowledge_industry ON category_knowledge(industry);
  `);
}

function ensureColumns(db, table, columns) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
  for (const [name, type] of Object.entries(columns)) {
    if (existing.has(name)) continue;
    if (type.includes("PRIMARY KEY")) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}

function upsertWithDefinition(db, definition, record) {
  const mapped = normalizeMappedRecord(definition.map(record));
  const columns = Object.keys(mapped);
  const placeholders = columns.map(() => "?").join(", ");
  const updates = columns
    .filter((column) => column !== "id")
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");

  db.prepare(`
    INSERT INTO ${definition.table} (${columns.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET ${updates}
  `).run(...columns.map((column) => mapped[column]));
}

function replacePromptRecords(db, prompts) {
  db.prepare("DELETE FROM ai_prompt_versions").run();
  db.prepare("DELETE FROM ai_prompts").run();
  for (const prompt of prompts) upsertPromptRecord(db, prompt);
}

function upsertPromptRecord(db, prompt) {
  const nowValue = new Date().toISOString();
  const promptRecord = normalizeMappedRecord({
    id: prompt.id,
    agent_code: prompt.agentCode ?? "*",
    prompt_name: prompt.name,
    current_version_id: prompt.currentVersion,
    status: prompt.status ?? "active",
    created_at: prompt.createdAt ?? prompt.updatedAt ?? nowValue,
    updated_at: prompt.updatedAt ?? prompt.createdAt ?? nowValue,
    activated_by: prompt.activatedBy,
    activated_at: prompt.activatedAt
  });

  db.prepare(`
    INSERT INTO ai_prompts (${Object.keys(promptRecord).join(", ")})
    VALUES (${Object.keys(promptRecord).map(() => "?").join(", ")})
    ON CONFLICT(id) DO UPDATE SET
      agent_code = excluded.agent_code,
      prompt_name = excluded.prompt_name,
      current_version_id = excluded.current_version_id,
      status = excluded.status,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      activated_by = excluded.activated_by,
      activated_at = excluded.activated_at
  `).run(...Object.values(promptRecord));

  db.prepare("DELETE FROM ai_prompt_versions WHERE prompt_id = ?").run(prompt.id);
  for (const version of prompt.versions ?? []) {
    const versionRecord = normalizeMappedRecord({
      id: version.id ?? `${prompt.id}_${slugify(version.version)}`,
      prompt_id: prompt.id,
      version: version.version,
      system_prompt: version.systemPrompt,
      user_prompt_template: version.userPromptTemplate,
      input_variables: toJson(version.inputVariables),
      output_schema_id: version.outputSchemaId,
      model_config_id: version.modelConfigId,
      default_model: version.defaultModel,
      status: version.status ?? "active",
      created_by: version.createdBy,
      created_at: version.createdAt ?? prompt.updatedAt ?? nowValue,
      change_log: version.changeLog
    });
    db.prepare(`
      INSERT INTO ai_prompt_versions (${Object.keys(versionRecord).join(", ")})
      VALUES (${Object.keys(versionRecord).map(() => "?").join(", ")})
      ON CONFLICT(id) DO UPDATE SET
        prompt_id = excluded.prompt_id,
        version = excluded.version,
        system_prompt = excluded.system_prompt,
        user_prompt_template = excluded.user_prompt_template,
        input_variables = excluded.input_variables,
        output_schema_id = excluded.output_schema_id,
        model_config_id = excluded.model_config_id,
        default_model = excluded.default_model,
        status = excluded.status,
        created_by = excluded.created_by,
        created_at = excluded.created_at,
        change_log = excluded.change_log
    `).run(...Object.values(versionRecord));
  }
}

function normalizeMappedRecord(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, toSqlValue(value, key)])
  );
}

function toSqlValue(value, key) {
  if ((value === undefined || value === null) && (key === "created_at" || key === "updated_at")) {
    return new Date().toISOString();
  }
  if (value === undefined) return null;
  return value;
}

function toJson(value) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function toIntegerBoolean(value) {
  return value ? 1 : 0;
}

function slugify(value) {
  return String(value ?? "unknown").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function safeJsonArrayLength(rawJson) {
  try {
    const parsed = JSON.parse(rawJson);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function countTableRows(db, table) {
  if (!sqliteTableExists(db, table)) return null;
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

function countSqliteTables(db) {
  return db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().count;
}

function sqliteTableExists(db, table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}
