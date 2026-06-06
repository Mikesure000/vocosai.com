-- ============================================
-- Vocos 种子数据
-- Demo 用户、团队、项目、模型配置
-- ============================================

-- 用户
INSERT INTO users (id, name, email, role, default_team_id, status, created_at, updated_at)
VALUES
  ('user_demo', 'Demo Admin', 'admin@vocos.local', 'super_admin', 'team_demo', 'active', datetime('now'), datetime('now')),
  ('user_ai_admin', 'Demo AI Engineer', 'ai@vocos.local', 'ai_engineer_admin', 'team_demo', 'active', datetime('now'), datetime('now')),
  ('user_member', 'Demo Member', 'member@vocos.local', 'member', 'team_demo', 'active', datetime('now'), datetime('now'));

-- 团队
INSERT INTO teams (id, team_name, plan_type, monthly_quota, used_quota, status, created_at, updated_at)
VALUES
  ('team_demo', 'Vocos Demo Team', 'internal', 1000000, 0, 'active', datetime('now'), datetime('now'));

-- 团队成员
INSERT INTO team_members (id, team_id, user_id, role, status, created_at, updated_at)
VALUES
  ('member_demo_admin', 'team_demo', 'user_demo', 'super_admin', 'active', datetime('now'), datetime('now')),
  ('member_demo_ai_admin', 'team_demo', 'user_ai_admin', 'ai_engineer_admin', 'active', datetime('now'), datetime('now')),
  ('member_demo_member', 'team_demo', 'user_member', 'member', 'active', datetime('now'), datetime('now'));

-- 项目
INSERT INTO projects (id, team_id, project_name, brand_name, product_name, industry, description, status, created_by, created_at, updated_at)
VALUES
  ('project_demo', 'team_demo', '某美妆品牌 5 月复盘', 'AURA LAB', '修护精华', 'beauty', '', 'active', 'user_demo', datetime('now'), datetime('now'));

-- 模型提供商
INSERT INTO model_providers (id, provider_name, base_url, status, created_at, updated_at)
VALUES
  ('provider_openai', 'openai', 'https://api.openai.com/v1', 'configured', datetime('now'), datetime('now')),
  ('provider_deepseek', 'deepseek', 'https://api.deepseek.com', 'configured', datetime('now'), datetime('now'));

-- 模型配置
INSERT INTO model_configs (id, provider_id, model_name, model_type, context_window, input_token_price, output_token_price, is_active, created_at, updated_at)
VALUES
  ('model_gpt_4_1', 'provider_openai', 'gpt-4.1', 'reasoning_generation', 128000, 0.00002, 0.00008, 1, datetime('now'), datetime('now')),
  ('model_deepseek_chat', 'provider_deepseek', 'deepseek-v4-flash', 'batch_semantic', 64000, 0.000002, 0.000004, 1, datetime('now'), datetime('now')),
  ('model_deepseek_v4_pro', 'provider_deepseek', 'deepseek-v4-pro', 'reasoning_generation', 128000, 0.000004, 0.000012, 1, datetime('now'), datetime('now'));

-- ============================================
-- 用户密码哈希更新（T-AUTH-26）
-- 密码: demo123456 — 每个用户独立 salt
-- 可重复执行（幂等）
-- ============================================
UPDATE users SET password_hash = 'eecd171c47ad7f520e2e94fa156593fd:84b064df26c18f83d2cbde651e39059e24b1bac080c921533220a288b7afd2f65d47dd406996c27a19dd268894fdc34dd769ec3af9e3865e1fc7236a85ed8d5b', updated_at = datetime('now') WHERE id = 'user_demo';
UPDATE users SET password_hash = 'f923e9fc2fdeeaa1365da303e92cf903:ee57c9516a7df0c6d7dc9d993e93500132a4554c29c655871c3ac87079565f019cd8a66abc2e2a2828dcfad366bd2c1b7ae07b416466f501478503e68286c4e9', updated_at = datetime('now') WHERE id = 'user_ai_admin';
UPDATE users SET password_hash = 'b77eb9333c73971db32bd1f994114140:0a21e27e79e908c8c131da38ff709f024e772548d186dbca10455870752b1d495d5bbbf549d3bb28c63e0ad9dc60d24725304b0c9246b1917106f23447d752c2', updated_at = datetime('now') WHERE id = 'user_member';
