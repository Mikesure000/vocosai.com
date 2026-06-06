// Skill Learning Engine — 持续迭代的 Agent+Skill 双层学习系统
// 从每次 AI Run 中提取Skill表现指标，生成改进建议

import { AGENTS, AGENT_SKILLS, getSkillByCode } from "./agents.mjs";

// ==================== Skill Metrics Collection ====================

export function buildSkillMetrics({ store, teamId, period = "current_month" }) {
  const runs = store.list("aiRuns").filter(r =>
    (!teamId || r.teamId === teamId) && isInPeriod(r.createdAt, period)
  );
  const feedbackItems = store.list("aiQualityFeedback")
    .filter(f => runs.some(r => r.id === f.aiRunId));

  // Per-agent metrics
  const agentMetrics = AGENTS.map(agent => {
    const agentRuns = runs.filter(r => r.agentName === agent.code);
    const agentFeedback = feedbackItems.filter(f =>
      agentRuns.some(r => r.id === f.aiRunId)
    );

    const successCount = agentRuns.filter(r => r.status === "success").length;
    const adoptedCount = agentFeedback.filter(f => f.action === "accepted").length;
    const editedCount = agentFeedback.filter(f => f.action === "edited").length;

    return {
      agentCode: agent.code,
      agentName: agent.name,
      skills: agent.skills,
      totalRuns: agentRuns.length,
      successRate: agentRuns.length === 0 ? 0 : Number((successCount / agentRuns.length * 100).toFixed(1)),
      adoptionRate: agentRuns.length === 0 ? 0 : Number((adoptedCount / agentRuns.length * 100).toFixed(1)),
      editRate: agentRuns.length === 0 ? 0 : Number((editedCount / agentRuns.length * 100).toFixed(1)),
      avgLatencyMs: Math.round(avg(agentRuns.map(r => r.latencyMs || 0))),
      avgCost: Number(avg(agentRuns.map(r => r.actualCost || 0)).toFixed(4)),
      totalCost: Number(sum(agentRuns.map(r => r.actualCost || 0)).toFixed(4)),
      schemaFailures: agentRuns.filter(r => r.schemaValidationStatus === "failed").length,
      fallbackRate: agentRuns.length === 0 ? 0 : Number((agentRuns.filter(r => r.fallbackUsed).length / agentRuns.length * 100).toFixed(1)),
      lastRunAt: agentRuns.length > 0 ? agentRuns[agentRuns.length - 1].createdAt : null
    };
  });

  // Per-skill metrics (inferred from agent metrics)
  const skillMetrics = AGENT_SKILLS.map(skill => {
    const agent = agentMetrics.find(a => a.agentCode === skill.agentCode);
    return {
      skillCode: skill.code,
      agentCode: skill.agentCode,
      agentName: skill.agentName,
      totalRuns: agent?.totalRuns || 0,
      successRate: agent?.successRate || 0,
      adoptionRate: agent?.adoptionRate || 0,
      inferredConfidence: agent?.totalRuns > 0 ? Math.min(100, agent.successRate * 0.8 + agent.adoptionRate * 0.2) : 0
    };
  });

  // Global summary
  const allSuccesses = runs.filter(r => r.status === "success").length;
  const allAdopted = feedbackItems.filter(f => f.action === "accepted").length;

  return {
    generatedAt: new Date().toISOString(),
    period,
    summary: {
      totalRuns: runs.length,
      overallSuccessRate: runs.length === 0 ? 0 : (allSuccesses / runs.length * 100).toFixed(1),
      overallAdoptionRate: feedbackItems.length === 0 ? 0 : (allAdopted / feedbackItems.length * 100).toFixed(1),
      totalCost: Number(sum(runs.map(r => r.actualCost || 0)).toFixed(4)),
      agentsWithData: agentMetrics.filter(a => a.totalRuns > 0).length,
      skillsWithData: skillMetrics.filter(s => s.totalRuns > 0).length
    },
    agentMetrics,
    skillMetrics,
    // 改进建议：基于指标自动生成
    improvementSuggestions: generateImprovementSuggestions({ agentMetrics, skillMetrics, runs })
  };
}

// ==================== Improvement Suggestion Engine ====================

function generateImprovementSuggestions({ agentMetrics, skillMetrics, runs }) {
  const suggestions = [];

  for (const agent of agentMetrics.filter(a => a.totalRuns >= 3)) {
    // Schema failure rate is high → suggest prompt schema alignment
    if (agent.schemaFailures / agent.totalRuns > 0.2) {
      suggestions.push({
        type: "schema_alignment",
        severity: "high",
        agentCode: agent.agentCode,
        agentName: agent.agentName,
        title: `${agent.agentName} Schema 失败率高`,
        detail: `近 ${agent.totalRuns} 次运行中 ${agent.schemaFailures} 次 Schema 验证失败(${(agent.schemaFailures / agent.totalRuns * 100).toFixed(0)}%)。建议检查 Prompt 输出格式是否与 Schema 定义一致。`,
        action: "review_prompt_vs_schema"
      });
    }

    // Edit rate is high → prompt needs refinement
    if (agent.editRate > 30) {
      suggestions.push({
        type: "prompt_refinement",
        severity: "medium",
        agentCode: agent.agentCode,
        agentName: agent.agentName,
        title: `${agent.agentName} 修改率高`,
        detail: `采纳率仅 ${agent.adoptionRate}%，修改率达 ${agent.editRate}%（目标修改率 < 20%）。输出质量需要提升——建议检查 Prompt 中是否缺少关键指令、示例或领域知识。`,
        action: "enhance_prompt_with_examples"
      });
    }

    // Cost is too high for this agent type
    if (agent.avgCost > 1.0) {
      suggestions.push({
        type: "cost_optimization",
        severity: "low",
        agentCode: agent.agentCode,
        agentName: agent.agentName,
        title: `${agent.agentName} 成本偏高`,
        detail: `平均每次运行成本 $${agent.avgCost.toFixed(2)}（总 $${agent.totalCost.toFixed(2)}）。考虑降级模型或限制上下文长度。`,
        action: "downgrade_model_or_limit_context"
      });
    }

    // Skill is learning — confidence rising over time
    if (agent.totalRuns >= 5 && agent.successRate > 85) {
      suggestions.push({
        type: "skill_maturing",
        severity: "info",
        agentCode: agent.agentCode,
        agentName: agent.agentName,
        title: `${agent.agentName} 已趋于稳定`,
        detail: `成功率 ${agent.successRate}%、采纳率 ${agent.adoptionRate}%——Skill 进入成熟期。建议：① 锁定当前 Prompt 版本为候选基线 ② 降低再训练频率。`,
        action: "lock_baseline_version"
      });
    }
  }

  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2, info: 3 };
  return suggestions.sort((a, b) => (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99));
}

// ==================== Skill Iteration Tracker ====================

export function buildSkillIterationHistory({ store, agentCode }) {
  const runs = store.list("aiRuns")
    .filter(r => r.agentName === agentCode)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  const snapshots = [];
  let window = [];
  const WINDOW_SIZE = 5;

  for (let i = 0; i < runs.length; i++) {
    window.push(runs[i]);
    if (window.length >= WINDOW_SIZE || i === runs.length - 1) {
      const successes = window.filter(r => r.status === "success").length;
      snapshots.push({
        windowIndex: snapshots.length,
        runCount: window.length,
        successRate: Number((successes / window.length * 100).toFixed(1)),
        avgCost: Number(avg(window.map(r => r.actualCost || 0)).toFixed(4)),
        avgLatency: Math.round(avg(window.map(r => r.latencyMs || 0))),
        startAt: window[0].createdAt,
        endAt: window[window.length - 1].createdAt
      });
      window = [];
    }
  }

  const overall = runs.length > 0 ? {
    agentCode,
    totalRuns: runs.length,
    overallSuccessRate: Number((runs.filter(r => r.status === "success").length / runs.length * 100).toFixed(1)),
    trend: snapshots.length >= 2
      ? (snapshots[snapshots.length - 1].successRate > snapshots[0].successRate ? "improving" : "declining")
      : "insufficient_data",
    snapshots
  } : { agentCode, totalRuns: 0, snapshots: [] };

  return overall;
}

// ==================== Utilities ====================

function isInPeriod(dateStr, period) {
  if (!dateStr || period === "all") return true;
  const date = new Date(dateStr);
  if (period === "current_month") {
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }
  if (period === "last_7_days") {
    const weekAgo = Date.now() - 7 * 86400000;
    return date.getTime() >= weekAgo;
  }
  return true;
}

function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
function avg(arr) { return arr.length === 0 ? 0 : sum(arr) / arr.length; }
