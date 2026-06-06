// 成本治理（Token 用量、预算告警、降级策略）
// Phase 1 shell — 核心逻辑 Phase 4 补充

const CHARS_PER_TOKEN = 4;

export function buildCostSummary({ store, teamId = "team_demo", projectId = null, taskId = null, period = "current_month" }) {
  const nowValue = new Date();
  const monthStart = new Date(nowValue.getFullYear(), nowValue.getMonth(), 1).toISOString();

  const runs = store.list("aiRuns")
    .filter((run) => {
      if (teamId && run.teamId !== teamId) return false;
      if (projectId && run.projectId !== projectId) return false;
      if (taskId && run.taskId !== taskId) return false;
      if (period === "current_month" && run.createdAt < monthStart) return false;
      return true;
    });

  const totalCost = runs.reduce((sum, run) => sum + (run.actualCost ?? 0), 0);
  const totalTokens = runs.reduce((sum, run) => sum + (run.totalTokenCount ?? 0), 0);

  return {
    period,
    teamId,
    projectId,
    taskId,
    totalRuns: runs.length,
    totalTokens,
    totalCost: Number(totalCost.toFixed(6)),
    summaries: []
  };
}

export function evaluateCostPolicy({ store, taskId, agent, input = {}, route, env = process.env }) {
  // Simplified: always permit with the default route
  return {
    decision: "proceed",
    route,
    estimatedCost: estimateModelCost({
      modelName: route.modelName,
      inputTokens: estimateTokens(input),
      outputTokens: 800
    }),
    warningCode: null,
    warningMessage: null
  };
}

export function getCostPolicyConfig({ team = {}, project = {}, task = {}, env = process.env } = {}) {
  return {
    maxCostPerTask: 10,
    maxDailyTokens: 1000000,
    autoFallbackOnLimit: true
  };
}

export function estimateModelCost({ modelName, inputTokens, outputTokens }) {
  const pricing = {
    "deepseek-v4-flash": { input: 0.000002, output: 0.000004 },
    "deepseek-v4-pro": { input: 0.000004, output: 0.000012 },
    "gpt-4.1": { input: 0.00002, output: 0.00008 },
    "gpt-4.1-mini": { input: 0.000005, output: 0.000015 }
  };

  const price = pricing[modelName] ?? { input: 0.000003, output: 0.000008 };
  return Number((inputTokens * price.input + outputTokens * price.output).toFixed(6));
}

export function estimateTokens(value) {
  if (value === null || value === undefined) return 0;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}
