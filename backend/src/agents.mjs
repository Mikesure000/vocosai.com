export const AGENTS = [
  { code: "task_goal_agent", name: "任务理解与目标识别 Agent", skills: ["content_goal_analysis", "audience_targeting", "platform_context"] },
  { code: "content_decomposition_agent", name: "原内容拆解 Agent", skills: ["structure_breakdown", "selling_point_extraction", "gap_analysis"] },
  { code: "comment_dedup_agent", name: "评论去重清洗 Agent", skills: ["exact_dedup", "fuzzy_dedup", "normalization"] },
  { code: "spam_filter_agent", name: "水军与无效评论过滤 Agent", skills: ["bot_detection", "emoji_spam", "template_patterns"] },
  { code: "thread_cleanup_agent", name: "多轮对话清洗 Agent", skills: ["reply_chain_rebuild", "role_identification", "context_recovery"] },
  { code: "sentiment_depth_agent", name: "情感深度分析 Agent", skills: ["intensity_scoring", "target_extraction", "evolution_tracking"] },
  { code: "high_value_comment_agent", name: "高价值评论筛选 Agent", skills: ["signal_scoring", "purchase_intent", "content_hook_mining"] },
  { code: "need_barrier_agent", name: "用户需求与购买障碍识别 Agent", skills: ["demand_clustering", "barrier_detection", "competitor_signal"] },
  { code: "content_comment_attribution_agent", name: "内容-评论归因 Agent", skills: ["point_level_attribution", "reaction_type", "gap_quantification"] },
  { code: "content_value_type_agent", name: "内容价值类型识别 Agent", skills: ["value_classification", "content_action", "13dim_tagging"] },
  { code: "platform_strategy_agent", name: "平台策略生成 Agent", skills: ["douyin_strategy", "xhs_strategy", "cross_platform_diff"] },
  { code: "production_card_agent", name: "内容生产卡生成 Agent", skills: ["shot_script", "copywriting", "asset_spec"] },
  { code: "comment_operation_agent", name: "评论区运营 Agent", skills: ["pinned_comment", "reply_scripts", "negative_handling"] },
  { code: "ad_fit_agent", name: "投流适配评分 Agent", skills: ["audience_clarity", "selling_point_clarity", "risk_assessment"] },
  { code: "pre_publish_check_agent", name: "发布前质检 Agent", skills: ["compliance_check", "consistency_check", "revision_suggest"] },
  { code: "report_assembly_agent", name: "报告组装 Agent", skills: ["markdown_format", "evidence_chain", "executive_summary"] },
  { code: "ai_quality_eval_agent", name: "AI 质量评估 Agent", skills: ["output_quality", "adoption_tracking", "skill_improvement"] },
].map((agent, index) => ({
  id: `agent_${String(index).padStart(2, "0")}`,
  code: agent.code,
  name: agent.name,
  version: "0.1.0",
  skills: agent.skills,
  inputSchemaId: `${agent.code}_input_v1`,
  outputSchemaId: `${agent.code}_output_v1`,
  defaultModel: index <= 10 ? "deepseek-v4-flash" : "deepseek-v4-pro",
  fallbackModel: index <= 10 ? "gpt-4.1-mini" : "gpt-4.1",
  maxRetries: 2,
  timeoutSeconds: index <= 7 ? 120 : 90,
  costLimit: index <= 7 ? 1.2 : 3.5,
  status: "active"
}));

// 为每个Agent生成32个Skill定义
export const AGENT_SKILLS = AGENTS.flatMap(agent => 
  agent.skills.map((skillCode, skillIdx) => ({
    id: `skill_${skillCode}`,
    agentCode: agent.code,
    agentName: agent.name,
    code: skillCode,
    name: skillCode.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    version: "0.1.0",
    successRate: 0,
    adoptionRate: 0,
    totalRuns: 0,
    avgLatencyMs: 0,
    avgCost: 0,
    lastRunAt: null,
    improvementSuggestions: []
  }))
);

export function getAgentByCode(code) {
  return AGENTS.find((agent) => agent.code === code);
}

export function getSkillsForAgent(agentCode) {
  return AGENT_SKILLS.filter(s => s.agentCode === agentCode);
}

export function getSkillByCode(skillCode) {
  return AGENT_SKILLS.find(s => s.code === skillCode);
}
