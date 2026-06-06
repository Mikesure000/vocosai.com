export function buildQualitySummary({ store, teamId = "team_demo", projectId = null, taskId = null, period = "current_month" }) {
  const team = store.get("teams", teamId) ?? store.list("teams")[0] ?? {};
  const projects = store.list("projects").filter((project) => project.teamId === team.id);
  const projectIds = new Set(projectId ? [projectId] : projects.map((project) => project.id));
  const taskIds = new Set(
    store.list("tasks")
      .filter((task) => task.teamId === team.id)
      .filter((task) => !projectId || task.projectId === projectId)
      .map((task) => task.id)
  );
  if (taskId) {
    taskIds.clear();
    taskIds.add(taskId);
  }

  const range = getPeriodRange(period);
  const runs = store.list("aiRuns")
    .filter((run) => run.teamId === team.id)
    .filter((run) => !projectId || projectIds.has(run.projectId))
    .filter((run) => !taskId || taskIds.has(run.taskId))
    .filter((run) => isWithinRange(run.createdAt, range));
  const feedback = store.list("aiQualityFeedback")
    .filter((item) => item.teamId === team.id)
    .filter((item) => !projectId || item.projectId === projectId)
    .filter((item) => !taskId || item.taskId === taskId)
    .filter((item) => isWithinRange(item.createdAt, range));

  return {
    teamId: team.id,
    teamName: team.name ?? team.teamName ?? "Unknown team",
    projectId,
    taskId,
    period,
    range,
    totals: summarizeRuns(runs),
    feedback: summarizeFeedback(feedback),
    byAgent: groupRuns(runs, (run) => run.agentName),
    byModel: groupRuns(runs, (run) => `${run.providerName}/${run.modelName}`),
    byTask: groupRuns(runs, (run) => run.taskId),
    daily: groupRuns(runs, (run) => String(run.createdAt ?? "").slice(0, 10)).sort((a, b) => a.key.localeCompare(b.key))
  };
}

function summarizeRuns(runs) {
  const totalRuns = runs.length;
  const successRuns = runs.filter((run) => run.status === "success").length;
  const failedRuns = runs.filter((run) => run.status !== "success").length;
  const blockedRuns = runs.filter((run) => run.executionMode === "blocked" || run.costPolicyDecision === "blocked").length;
  const schemaFailures = runs.filter((run) => run.schemaValidationStatus === "failed").length;
  const schemaSkipped = runs.filter((run) => run.schemaValidationStatus === "skipped").length;
  const fallbackRuns = runs.filter((run) => run.fallbackUsed || run.executionMode === "mock_fallback").length;
  const retryRuns = runs.filter((run) => Number(run.retryCount ?? 0) > 0 || run.retryOfRunId).length;
  const jsonRepairRuns = runs.filter((run) => run.jsonRepairUsed).length;
  const modelFailureRuns = runs.filter(hasProviderFailure).length;
  const totalLatencyMs = sum(runs, (run) => Number(run.latencyMs ?? 0));
  const totalCost = sum(runs, (run) => Number(run.actualCost ?? 0));

  const metrics = {
    totalRuns,
    successRuns,
    failedRuns,
    blockedRuns,
    successRate: rate(successRuns, totalRuns),
    failureRate: rate(failedRuns, totalRuns),
    schemaFailureRate: rate(schemaFailures, totalRuns),
    schemaSkippedRate: rate(schemaSkipped, totalRuns),
    modelFailureRate: rate(modelFailureRuns, totalRuns),
    fallbackRate: rate(fallbackRuns, totalRuns),
    retryRate: rate(retryRuns, totalRuns),
    jsonRepairRate: rate(jsonRepairRuns, totalRuns),
    avgLatencyMs: totalRuns ? Math.round(totalLatencyMs / totalRuns) : 0,
    avgCost: totalRuns ? Number((totalCost / totalRuns).toFixed(6)) : 0,
    totalCost: Number(totalCost.toFixed(6))
  };

  return {
    ...metrics,
    qualityScore: scoreQuality(metrics)
  };
}

function summarizeFeedback(feedback) {
  const latest = latestFeedbackByRun(feedback);
  const total = latest.length;
  const accepted = latest.filter((item) => item.action === "accepted").length;
  const edited = latest.filter((item) => item.action === "edited").length;
  const regenerated = latest.filter((item) => item.action === "regenerated").length;
  const rejected = latest.filter((item) => item.action === "rejected").length;
  return {
    total,
    events: feedback.length,
    accepted,
    edited,
    regenerated,
    rejected,
    adoptionRate: rate(accepted, total),
    editRate: rate(edited, total),
    regenerationRate: rate(regenerated, total),
    rejectionRate: rate(rejected, total),
    source: total > 0 ? "feedback" : "not_collected_yet"
  };
}

function latestFeedbackByRun(feedback) {
  const latest = new Map();
  for (const item of feedback) {
    const key = item.aiRunId ?? item.ai_run_id ?? item.id;
    const current = latest.get(key);
    if (!current || String(item.createdAt ?? "").localeCompare(String(current.createdAt ?? "")) > 0) {
      latest.set(key, item);
    }
  }
  return [...latest.values()];
}

function groupRuns(runs, keyFn) {
  const groups = new Map();
  for (const run of runs) {
    const key = keyFn(run) || "unknown";
    const item = groups.get(key) ?? { key, runs: [] };
    item.runs.push(run);
    groups.set(key, item);
  }

  return [...groups.values()]
    .map((item) => ({
      key: item.key,
      ...summarizeRuns(item.runs)
    }))
    .sort((a, b) => a.qualityScore - b.qualityScore || b.totalRuns - a.totalRuns);
}

function hasProviderFailure(run) {
  if (run.errorCode && !String(run.errorCode).startsWith("cost_policy") && run.errorCode !== "schema_validation_failed") {
    return true;
  }
  return Array.isArray(run.providerAttempts) && run.providerAttempts.some((attempt) => attempt.status === "failed");
}

function scoreQuality(metrics) {
  const penalty =
    metrics.schemaFailureRate * 0.35 +
    metrics.modelFailureRate * 0.25 +
    metrics.fallbackRate * 0.15 +
    metrics.retryRate * 0.15 +
    metrics.jsonRepairRate * 0.1 +
    metrics.schemaSkippedRate * 0.08;
  return Number(Math.max(0, Math.min(100, 100 - penalty)).toFixed(1));
}

function getPeriodRange(period) {
  const now = new Date();
  if (period === "all") {
    return { start: null, end: null };
  }
  if (period === "last_7_days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { start: start.toISOString(), end: now.toISOString() };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: start.toISOString(), end: now.toISOString() };
}

function isWithinRange(value, range) {
  if (!range.start && !range.end) return true;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return false;
  if (range.start && time < Date.parse(range.start)) return false;
  if (range.end && time > Date.parse(range.end)) return false;
  return true;
}

function rate(count, total) {
  return total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0;
}

function sum(items, fn) {
  return items.reduce((total, item) => total + fn(item), 0);
}
