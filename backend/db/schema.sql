PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 组织架构
CREATE TABLE users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT,
    password_hash TEXT, avatar_url TEXT, role TEXT NOT NULL DEFAULT 'member',
    default_team_id TEXT, status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE teams (
    id TEXT PRIMARY KEY, team_name TEXT NOT NULL, owner_user_id TEXT,
    plan_type TEXT DEFAULT 'internal', monthly_quota REAL DEFAULT 0,
    used_quota REAL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE team_members (
    id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id),
    user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

-- 项目与任务
CREATE TABLE projects (
    id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id),
    project_name TEXT NOT NULL, brand_name TEXT, product_name TEXT,
    industry TEXT, description TEXT, status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE analysis_tasks (
    id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id),
    project_id TEXT NOT NULL REFERENCES projects(id), task_name TEXT NOT NULL,
    platform TEXT NOT NULL, content_url TEXT, content_title TEXT NOT NULL,
    content_body TEXT, content_goal TEXT DEFAULT 'unknown',
    brand_info TEXT, product_info TEXT, competitor_info TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    started_at TEXT, completed_at TEXT
);

-- 评论数据
CREATE TABLE comment_files (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES analysis_tasks(id),
    file_name TEXT NOT NULL, storage_url TEXT, file_type TEXT,
    file_size INTEGER, row_count INTEGER, mapping_config TEXT,
    parse_status TEXT NOT NULL DEFAULT 'uploaded', raw_content TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE comments (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES analysis_tasks(id),
    comment_file_id TEXT REFERENCES comment_files(id),
    comment_id_external TEXT, parent_comment_id TEXT, reply_to_comment_id TEXT,
    user_id_hash TEXT, user_name_hash TEXT, comment_text TEXT NOT NULL,
    normalized_text TEXT, like_count INTEGER DEFAULT 0,
    created_at_external TEXT, ip_location TEXT, user_level TEXT,
    is_author_reply INTEGER DEFAULT 0, source_hash TEXT,
    clean_status TEXT DEFAULT 'raw', value_score REAL,
    sentiment_label TEXT, intent_label TEXT,
    created_at TEXT NOT NULL
);

-- AI 执行记录
CREATE TABLE ai_runs (
    id TEXT PRIMARY KEY, team_id TEXT NOT NULL, project_id TEXT NOT NULL,
    task_id TEXT NOT NULL REFERENCES analysis_tasks(id), agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL, agent_version TEXT, prompt_id TEXT,
    prompt_version TEXT, schema_id TEXT, provider_name TEXT NOT NULL,
    model_name TEXT NOT NULL, model_route_rule_id TEXT,
    execution_mode TEXT NOT NULL DEFAULT 'mock',
    input_token_count INTEGER NOT NULL DEFAULT 0,
    output_token_count INTEGER NOT NULL DEFAULT 0,
    total_token_count INTEGER NOT NULL DEFAULT 0,
    estimated_cost REAL NOT NULL DEFAULT 0,
    actual_cost REAL NOT NULL DEFAULT 0, latency_ms INTEGER,
    status TEXT NOT NULL, error_code TEXT, error_message TEXT,
    warning_code TEXT, warning_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0, retry_of_run_id TEXT,
    fallback_used INTEGER NOT NULL DEFAULT 0, fallback_reason TEXT,
    provider_attempts TEXT, json_repair_used INTEGER NOT NULL DEFAULT 0,
    input_hash TEXT, output_raw TEXT, output_json TEXT,
    schema_validation_status TEXT, schema_validation_errors TEXT,
    cost_policy_decision TEXT, cost_policy_reason TEXT,
    cost_policy_snapshot TEXT, created_at TEXT NOT NULL,
    completed_at TEXT, created_by TEXT
);

-- AI 质量反馈
CREATE TABLE ai_quality_feedback (
    id TEXT PRIMARY KEY, team_id TEXT NOT NULL, project_id TEXT,
    task_id TEXT, ai_run_id TEXT REFERENCES ai_runs(id),
    agent_name TEXT, output_type TEXT,
    action TEXT NOT NULL, edit_distance_ratio REAL,
    rating INTEGER, comment TEXT, created_by TEXT,
    created_at TEXT NOT NULL
);

-- 报告
CREATE TABLE reports (
    id TEXT PRIMARY KEY, team_id TEXT NOT NULL, project_id TEXT NOT NULL,
    task_id TEXT NOT NULL REFERENCES analysis_tasks(id), title TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'markdown',
    status TEXT NOT NULL DEFAULT 'generated',
    summary TEXT, markdown TEXT, metrics TEXT,
    created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

-- 治理
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY, team_id TEXT, user_id TEXT, role TEXT,
    action TEXT NOT NULL, resource_type TEXT NOT NULL,
    resource_id TEXT, metadata TEXT, created_at TEXT NOT NULL
);

CREATE TABLE task_pipeline_jobs (
    task_id TEXT PRIMARY KEY REFERENCES analysis_tasks(id),
    status TEXT NOT NULL, started_at TEXT, completed_at TEXT,
    completed_agents INTEGER NOT NULL DEFAULT 0,
    total_agents INTEGER NOT NULL DEFAULT 0,
    error TEXT, updated_at TEXT NOT NULL
);

-- AI 配置
CREATE TABLE model_providers (
    id TEXT PRIMARY KEY, provider_name TEXT NOT NULL,
    base_url TEXT NOT NULL, api_key_encrypted TEXT,
    api_key_masked TEXT, key_updated_at TEXT, key_updated_by TEXT,
    status TEXT NOT NULL DEFAULT 'disabled',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE model_configs (
    id TEXT PRIMARY KEY, provider_id TEXT NOT NULL REFERENCES model_providers(id),
    model_name TEXT NOT NULL, model_type TEXT, context_window INTEGER,
    input_token_price REAL, output_token_price REAL,
    rate_limit_per_minute INTEGER, timeout_seconds INTEGER,
    is_active INTEGER DEFAULT 1, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE ai_agents (
    id TEXT PRIMARY KEY, agent_name TEXT NOT NULL,
    agent_code TEXT NOT NULL UNIQUE, agent_version TEXT NOT NULL,
    description TEXT, input_schema_id TEXT, output_schema_id TEXT,
    default_prompt_id TEXT, default_model TEXT, fallback_model TEXT,
    max_retries INTEGER, timeout_seconds INTEGER, cost_limit REAL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE ai_prompts (
    id TEXT PRIMARY KEY, agent_code TEXT NOT NULL,
    prompt_name TEXT NOT NULL, current_version_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    activated_by TEXT, activated_at TEXT
);

CREATE TABLE ai_prompt_versions (
    id TEXT PRIMARY KEY, prompt_id TEXT NOT NULL, version TEXT NOT NULL,
    system_prompt TEXT NOT NULL, user_prompt_template TEXT NOT NULL,
    input_variables TEXT, output_schema_id TEXT, model_config_id TEXT,
    default_model TEXT, status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT, created_at TEXT NOT NULL, change_log TEXT
);

CREATE TABLE ai_schemas (
    id TEXT PRIMARY KEY, schema_name TEXT NOT NULL,
    schema_version TEXT NOT NULL, schema_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE schema_migrations (
    id TEXT PRIMARY KEY, applied_at TEXT NOT NULL
);

-- 索引
CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);
CREATE INDEX idx_analysis_tasks_project ON analysis_tasks(project_id);
CREATE INDEX idx_analysis_tasks_status ON analysis_tasks(status);
CREATE INDEX idx_comments_task ON comments(task_id);
CREATE INDEX idx_comments_clean_status ON comments(clean_status);
CREATE INDEX idx_ai_runs_task ON ai_runs(task_id);
CREATE INDEX idx_ai_runs_agent ON ai_runs(agent_name);
CREATE INDEX idx_ai_runs_model ON ai_runs(provider_name, model_name);
CREATE INDEX idx_ai_runs_status ON ai_runs(status);
CREATE INDEX idx_ai_quality_feedback_run ON ai_quality_feedback(ai_run_id);
CREATE INDEX idx_ai_quality_feedback_task ON ai_quality_feedback(task_id);
CREATE INDEX idx_reports_task ON reports(task_id);
CREATE INDEX idx_audit_logs_team ON audit_logs(team_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_ai_prompt_versions_prompt ON ai_prompt_versions(prompt_id);
CREATE INDEX idx_task_pipeline_jobs_status ON task_pipeline_jobs(status);
