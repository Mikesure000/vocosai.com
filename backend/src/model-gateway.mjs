import { getAgentByCode } from "./agents.mjs";
import { buildAgentContext } from "./comment-insights.mjs";
import { evaluateCostPolicy, estimateModelCost, estimateTokens } from "./cost-governance.mjs";
import { createId, now } from "./store.mjs";
import { getActivePromptForAgent, getSchemaById } from "./schemas.mjs";
import { validateJsonSchema } from "./schema-validator.mjs";
import {
  getProviderStatuses,
  invokeModel,
  isLiveModelEnabled,
  resolveProviderRoute
} from "./model-adapters.mjs";
import { getStoredProviderSecrets } from "./provider-keys.mjs";

// ==================== Pipeline Stages ====================
// 将17个Agent按业务环节分组，前序输出作为后续输入的强化上下文
const PIPELINE_STAGES = [
  {
    id: "content_analysis",
    label: "内容理解",
    icon: "🎯",
    agents: ["task_goal_agent", "content_decomposition_agent"],
    description: "分析内容目标、拆解结构卖点、识别缺口",
    outputKey: "content_analysis"
  },
  {
    id: "data_cleaning",
    label: "数据清洗",
    icon: "🧹",
    agents: ["comment_dedup_agent", "spam_filter_agent", "thread_cleanup_agent"],
    description: "评论去重、水军过滤、回复链清洗",
    outputKey: "data_cleaning"
  },
  {
    id: "deep_analysis",
    label: "深度分析",
    icon: "🔍",
    agents: ["sentiment_depth_agent", "content_comment_attribution_agent", "content_value_type_agent", "need_barrier_agent"],
    description: "情感强度/靶向识别 → 评论归因 → 价值分类 → 需求障碍",
    outputKey: "deep_analysis"
  },
  {
    id: "insight_extraction",
    label: "洞察筛选",
    icon: "💎",
    agents: ["high_value_comment_agent"],
    description: "筛选高价值评论，提取可转选题的内容信号",
    outputKey: "insights"
  },
  {
    id: "strategy_generation",
    label: "策略生成",
    icon: "📋",
    agents: ["platform_strategy_agent", "production_card_agent", "comment_operation_agent"],
    description: "平台差异化策略 → 可派单生产卡 → 评论区运营方案",
    outputKey: "strategies"
  },
  {
    id: "quality_review",
    label: "质量审核",
    icon: "✅",
    agents: ["ad_fit_agent", "pre_publish_check_agent", "report_assembly_agent", "ai_quality_eval_agent"],
    description: "投流适配评分 → 发布前质检 → 报告组装 → AI输出质量评估",
    outputKey: "quality"
  }
];

// 所有有序Agent列表（保持兼容）
const ORDERED_AGENTS = PIPELINE_STAGES.flatMap(s => s.agents);

export async function runAgent({ store, taskId, agentName, input = {}, promptVersion = "latest", modelPreference = "auto", retryOfRunId = null }) {
  const agent = getAgentByCode(agentName);
  if (!agent) {
    throw new Error(`Unknown agent_name: ${agentName}`);
  }

  const route = resolveProviderRoute(agent, modelPreference);
  const enrichedInput = enrichAgentInput({ store, taskId, input });
  const prompt = resolveActivePromptForAgent(store, agent.code);
  const promptVersionResolved = promptVersion === "latest"
    ? prompt?.currentVersion ?? "v0.1.0"
    : promptVersion;
  const selectedPrompt = selectPromptVersion(prompt, promptVersionResolved);
  const startedAt = Date.now();
  const schema = resolveOutputSchemaForAgent({ store, agent, selectedPrompt });
  const providerRuntime = getStoredProviderSecrets(store);
  const costPolicy = evaluateCostPolicy({ store, taskId, agent, input: enrichedInput, route });
  if (costPolicy.decision === "blocked") {
    const blockedRun = buildCostPolicyBlockedRun({
      taskId,
      agent,
      input: enrichedInput,
      prompt,
      promptVersion: promptVersionResolved,
      schema,
      route: costPolicy.route,
      costPolicy,
      retryOfRunId,
      startedAt
    });
    await store.insert("aiRuns", blockedRun);
    return blockedRun;
  }

  const modelResult = await resolveModelOutput({
    route: costPolicy.route,
    prompt: selectedPrompt,
    schema,
    agent,
    input: enrichedInput,
    taskId,
    promptVersion: promptVersionResolved,
    providerRuntime
  });
  const outputJson = {
    task_id: taskId,
    agent: agent.code,
    model: modelResult.modelName,
    prompt_version: promptVersionResolved,
    status: "success",
    ...modelResult.outputJson
  };
  if (enrichedInput.force_invalid_schema) {
    delete outputJson.evidence;
  }

  const inputTokens = estimateTokens(enrichedInput);
  const outputTokens = estimateTokens(outputJson);
  const cost = estimateModelCost({ modelName: modelResult.modelName, inputTokens, outputTokens });
  const validation = validateJsonSchema(outputJson, schema?.schema);

  const aiRun = {
    id: createId("airun"),
    teamId: enrichedInput.team_id ?? "team_demo",
    projectId: enrichedInput.project_id ?? "project_demo",
    taskId,
    agentId: agent.id,
    agentName: agent.code,
    agentVersion: agent.version,
    promptId: prompt?.id ?? `${agent.code}_prompt`,
    promptVersion: promptVersionResolved,
    schemaId: schema?.id ?? agent.outputSchemaId,
    providerName: modelResult.providerName,
    modelName: modelResult.modelName,
    modelRouteRuleId: `${agent.code}_route`,
    executionMode: modelResult.executionMode,
    inputTokenCount: inputTokens,
    outputTokenCount: outputTokens,
    totalTokenCount: inputTokens + outputTokens,
    estimatedCost: cost,
    actualCost: cost,
    latencyMs: modelResult.latencyMs ?? Date.now() - startedAt,
    status: validation.ok ? "success" : "failed",
    errorCode: validation.ok ? null : "schema_validation_failed",
    errorMessage: validation.ok ? null : validation.errors.join("; "),
    warningCode: validation.ok ? modelResult.warningCode ?? costPolicy.warningCode : null,
    warningMessage: validation.ok ? modelResult.warningMessage ?? costPolicy.warningMessage : null,
    retryCount: modelResult.retryCount,
    retryOfRunId,
    fallbackUsed: modelResult.fallbackUsed,
    fallbackReason: modelResult.fallbackReason,
    providerAttempts: modelResult.providerAttempts,
    jsonRepairUsed: modelResult.jsonRepairUsed,
    inputHash: `${modelResult.executionMode}:${inputTokens}`,
    outputRaw: modelResult.outputRaw ?? JSON.stringify(outputJson),
    outputJson,
    schemaValidationStatus: validation.ok ? "passed" : "failed",
    schemaValidationErrors: validation.errors,
    costPolicyDecision: costPolicy.decision,
    costPolicyReason: costPolicy.reason,
    costPolicySnapshot: costPolicy,
    createdAt: now(),
    completedAt: now(),
    createdBy: enrichedInput.created_by ?? "user_demo"
  };

  await store.insert("aiRuns", aiRun);
  return aiRun;
}

function buildCostPolicyBlockedRun({
  taskId,
  agent,
  input,
  prompt,
  promptVersion,
  schema,
  route,
  costPolicy,
  retryOfRunId,
  startedAt
}) {
  const inputTokens = estimateTokens(input);
  return {
    id: createId("airun"),
    teamId: input.team_id ?? "team_demo",
    projectId: input.project_id ?? "project_demo",
    taskId,
    agentId: agent.id,
    agentName: agent.code,
    agentVersion: agent.version,
    promptId: prompt?.id ?? `${agent.code}_prompt`,
    promptVersion,
    schemaId: schema?.id ?? agent.outputSchemaId,
    providerName: route.providerName,
    modelName: route.modelName,
    modelRouteRuleId: `${agent.code}_route:cost_policy`,
    executionMode: "blocked",
    inputTokenCount: inputTokens,
    outputTokenCount: 0,
    totalTokenCount: inputTokens,
    estimatedCost: costPolicy.estimatedCost,
    actualCost: 0,
    latencyMs: Date.now() - startedAt,
    status: "failed",
    errorCode: costPolicy.errorCode,
    errorMessage: costPolicy.message,
    warningCode: null,
    warningMessage: null,
    retryCount: 0,
    retryOfRunId,
    fallbackUsed: false,
    fallbackReason: null,
    providerAttempts: [
      {
        providerName: route.providerName,
        modelName: route.modelName,
        attemptNumber: 0,
        status: "blocked",
        errorCode: costPolicy.errorCode,
        errorMessage: costPolicy.message,
        latencyMs: 0,
        repairedJson: false
      }
    ],
    jsonRepairUsed: false,
    inputHash: `blocked:${inputTokens}`,
    outputRaw: JSON.stringify({ cost_policy: costPolicy }),
    outputJson: null,
    schemaValidationStatus: "skipped",
    schemaValidationErrors: [],
    costPolicyDecision: costPolicy.decision,
    costPolicyReason: costPolicy.reason,
    costPolicySnapshot: costPolicy,
    createdAt: now(),
    completedAt: now(),
    createdBy: input.created_by ?? "user_demo"
  };
}

export async function runTaskPipeline({ store, taskId }) {
  const task = store.get("tasks", taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  // 更新任务状态为 analyzing
  await store.update("tasks", taskId, { status: "analyzing", startedAt: now() });

  const allRuns = [];
  let stageOutputs = {}; // 累积每个stage的输出

  for (const stage of PIPELINE_STAGES) {
    const stageRuns = [];
    const stageInput = buildStageInput({ task, stage, previousOutputs: stageOutputs });

    for (const agentCode of stage.agents) {
      const run = await runAgent({
        store,
        taskId,
        agentName: agentCode,
        input: stageInput,
        promptVersion: "latest"
      });
      stageRuns.push(run);
    }

    // 收集本stage的输出，供下个stage使用
    stageOutputs[stage.outputKey] = {
      stageId: stage.id,
      label: stage.label,
      agents: stage.agents,
      completedAt: now(),
      runs: stageRuns.map(r => ({
        agentName: r.agentName,
        status: r.status,
        outputJson: safeExtractOutput(r),
        tokens: r.totalTokenCount,
        cost: r.actualCost
      }))
    };

    allRuns.push(...stageRuns);
  }

  // 更新任务状态
  const hasFailures = allRuns.some(r => r.status === "failed");
  await store.update("tasks", taskId, {
    status: hasFailures ? "partially_failed" : "completed",
    completedAt: now()
  });

  return {
    status: hasFailures ? "partially_failed" : "completed",
    stages: PIPELINE_STAGES.length,
    runs: allRuns.length,
    stageOutputs,
    runs: allRuns
  };
}

// 构建stage专用输入：基础上下文 + 前序stage产出
function buildStageInput({ task, stage, previousOutputs }) {
  const base = {
    team_id: task.teamId,
    project_id: task.projectId,
    content_title: task.contentTitle,
    content_body: task.contentBody || "",
    content_url: task.contentUrl || "",
    content_goal: task.contentGoal || "unknown",
    platform: task.platform || "douyin",
    brand_info: task.brandInfo || "",
    product_info: task.productInfo || "",
    stage: stage.id,
    stage_label: stage.label,
    stage_purpose: stage.description
  };

  // 喂入前序stage的关键产出
  if (Object.keys(previousOutputs).length > 0) {
    base.previous_stages = {};
    for (const [key, output] of Object.entries(previousOutputs)) {
      base.previous_stages[key] = {
        label: output.label,
        agents: output.agents,
        summaries: output.runs
          .filter(r => r.status === "success")
          .slice(0, 3)
          .map(r => ({ agent: r.agentName, output: r.outputJson }))
      };
    }
  }

  return base;
}

function safeExtractOutput(run) {
  try {
    if (run.outputJson) return run.outputJson;
    return null;
  } catch { return null; }
}

export function getModelRoutes(store) {
  return store.list("agents").map((agent) => {
    const route = resolveProviderRoute(agent, "auto");
    return {
      agentId: agent.id,
      agentName: agent.code,
      providerName: route.providerName,
      primaryModel: route.modelName,
      fallbackProviderName: route.fallbackProviderName,
      fallbackModel: route.fallbackModelName,
      maxRetries: agent.maxRetries,
      timeoutSeconds: agent.timeoutSeconds,
      costLimit: agent.costLimit
    };
  });
}

export function getModelProviderStatuses(store) {
  const providerRuntime = store ? getStoredProviderSecrets(store) : {};
  return {
    mode: process.env.VOCOS_MODEL_MODE || "auto",
    providers: getProviderStatuses(process.env, providerRuntime)
  };
}

export function getPipelineStages() {
  return PIPELINE_STAGES.map(s => ({
    id: s.id,
    label: s.label,
    icon: s.icon,
    outputKey: s.outputKey,
    description: s.description,
    agents: s.agents,
    agentCount: s.agents.length
  }));
}

function resolveActivePromptForAgent(store, agentCode) {
  const prompts = store?.list("aiPrompts") ?? [];
  return prompts.find((prompt) => prompt.agentCode === agentCode)
    ?? prompts.find((prompt) => prompt.agentCode === "*")
    ?? getActivePromptForAgent(agentCode);
}

function enrichAgentInput({ store, taskId, input }) {
  const task = store?.get?.("tasks", taskId);
  if (!task) return input;
  return {
    ...buildAgentContext({ store, task }),
    ...input
  };
}

function selectPromptVersion(prompt, version) {
  if (!prompt) return null;
  const selectedVersion = prompt.versions?.find((item) => item.version === version)
    ?? prompt.versions?.find((item) => item.version === prompt.currentVersion)
    ?? prompt.versions?.[0]
    ?? null;
  return {
    ...prompt,
    versions: selectedVersion ? [selectedVersion] : []
  };
}

function resolveSchemaById(store, schemaId) {
  return store?.get("aiSchemas", schemaId)
    ?? getSchemaById(schemaId)
    ?? null;
}

function resolveOutputSchemaForAgent({ store, agent, selectedPrompt }) {
  const selectedVersion = selectedPrompt?.versions?.[0];
  const schemaId = selectedVersion?.outputSchemaId ?? agent.outputSchemaId ?? "agent_standard_output_v1";
  return resolveSchemaById(store, schemaId)
    ?? resolveSchemaById(store, "agent_standard_output_v1");
}

async function resolveModelOutput({ route, prompt, schema, agent, input, taskId, promptVersion, providerRuntime }) {
  if (isLiveModelEnabled()) {
    const live = await runLiveAttempts({ route, prompt, schema, agent, input, providerRuntime });

    if (live.ok) {
      return {
        providerName: live.route.providerName,
        modelName: live.route.modelName,
        outputJson: normalizeProviderOutput(live.outputJson, { agent, input, taskId, promptVersion, route: live.route }),
        outputRaw: live.content,
        executionMode: "live",
        latencyMs: live.latencyMs,
        fallbackUsed: live.fallbackUsed,
        fallbackReason: live.fallbackReason,
        retryCount: live.retryCount,
        providerAttempts: live.providerAttempts,
        jsonRepairUsed: live.repairedJson,
        warningCode: null,
        warningMessage: null
      };
    }

    return buildMockModelResult({
      route,
      agent,
      input,
      taskId,
      executionMode: "mock_fallback",
      fallbackUsed: true,
      fallbackReason: summarizeFallbackReason(live.providerAttempts),
      providerAttempts: live.providerAttempts,
      retryCount: live.retryCount,
      latencyMs: live.latencyMs,
      warningCode: live.hasRequestFailure ? "provider_unavailable" : null,
      warningMessage: live.hasRequestFailure ? summarizeFallbackReason(live.providerAttempts) : null
    });
  }

  return buildMockModelResult({
    route,
    agent,
    input,
    taskId,
    executionMode: "mock",
    fallbackUsed: false,
    fallbackReason: null,
    providerAttempts: [],
    retryCount: 0,
    latencyMs: null,
    warningCode: null,
    warningMessage: null
  });
}

async function runLiveAttempts({ route, prompt, schema, agent, input, providerRuntime }) {
  const providerAttempts = [];
  const routes = buildRouteAttempts(route);
  let retryCount = 0;
  let latencyMs = 0;
  let hasRequestFailure = false;

  for (const [routeIndex, attemptRoute] of routes.entries()) {
    const maxAttempts = Math.max(1, Number(agent.maxRetries ?? 0) + 1);
    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
      const live = await invokeModel({
        route: attemptRoute,
        prompt,
        agent,
        input,
        outputSchema: schema?.schema,
        timeoutMs: agent.timeoutSeconds * 1000,
        providerRuntime
      });

      latencyMs += live.latencyMs ?? 0;
      providerAttempts.push({
        providerName: attemptRoute.providerName,
        modelName: attemptRoute.modelName,
        attemptNumber,
        status: live.ok ? "success" : live.skipped ? "skipped" : "failed",
        errorCode: live.ok ? null : live.errorCode,
        errorMessage: live.ok ? null : live.errorMessage,
        latencyMs: live.latencyMs ?? 0,
        repairedJson: Boolean(live.repairedJson)
      });

      if (live.ok) {
        return {
          ...live,
          route: attemptRoute,
          fallbackUsed: routeIndex > 0,
          fallbackReason: routeIndex > 0 ? summarizeFallbackReason(providerAttempts.slice(0, -1)) : null,
          retryCount,
          providerAttempts,
          latencyMs
        };
      }

      if (!live.skipped) hasRequestFailure = true;
      if (live.skipped) break;
      if (attemptNumber < maxAttempts) retryCount += 1;
    }
  }

  return {
    ok: false,
    providerAttempts,
    retryCount,
    latencyMs,
    hasRequestFailure
  };
}

function buildRouteAttempts(route) {
  const attempts = [
    { providerName: route.providerName, modelName: route.modelName }
  ];

  if (route.fallbackProviderName && route.fallbackModelName) {
    const fallbackKey = `${route.fallbackProviderName}:${route.fallbackModelName}`;
    const primaryKey = `${route.providerName}:${route.modelName}`;
    if (fallbackKey !== primaryKey) {
      attempts.push({ providerName: route.fallbackProviderName, modelName: route.fallbackModelName });
    }
  }

  return attempts;
}

function buildMockModelResult({
  route,
  agent,
  input,
  taskId,
  executionMode,
  fallbackUsed,
  fallbackReason,
  providerAttempts,
  retryCount,
  latencyMs,
  warningCode,
  warningMessage
}) {
  const mock = buildMockResult({ agent, input, taskId });
  return {
    providerName: route.providerName,
    modelName: route.modelName,
    outputJson: normalizeMockOutput(mock),
    outputRaw: JSON.stringify({ fallback_reason: fallbackReason, provider_attempts: providerAttempts, output: mock }),
    executionMode,
    latencyMs,
    fallbackUsed,
    fallbackReason,
    retryCount,
    providerAttempts,
    jsonRepairUsed: false,
    warningCode,
    warningMessage
  };
}

function summarizeFallbackReason(providerAttempts) {
  const meaningful = providerAttempts.filter((attempt) => attempt.status !== "success");
  if (meaningful.length === 0) return null;
  const last = meaningful[meaningful.length - 1];
  return `${last.providerName}/${last.modelName}: ${last.errorCode ?? last.status}`;
}

function buildMockResult({ agent, input, taskId }) {
  const insights = input.comment_insights ?? {};
  const evidence = pickEvidenceForAgent(agent.code, insights);
  const result = buildAgentSpecificResult({ agentCode: agent.code, input, insights, evidence });

  return {
    summary: buildAgentSummary({ agent, insights }),
    evidence,
    payload: {
      task_id: taskId,
      platform: input.platform ?? "unknown",
      content_goal: input.content_goal ?? "unknown",
      ...result
    },
    riskFlags: [],
    confidenceScore: insights.signalCoverage ? Math.min(0.92, 0.68 + insights.signalCoverage * 0.25) : 0.7
  };
}

function pickEvidenceForAgent(agentCode, insights) {
  const byKey = new Map((insights.signals ?? []).map((signal) => [signal.key, signal.evidence ?? []]));
  const preferredKeys = {
    content_decomposition_agent: ["ingredient_focus", "scenario_need", "effect_skepticism"],
    high_value_comment_agent: ["purchase_intent", "effect_skepticism", "trust_gap", "price_objection"],
    need_barrier_agent: ["effect_skepticism", "trust_gap", "price_objection", "safety_concern", "audience_fit"],
    content_comment_attribution_agent: ["ingredient_focus", "effect_skepticism", "scenario_need", "trust_gap"],
    content_value_type_agent: ["ingredient_focus", "scenario_need", "purchase_intent"],
    production_card_agent: ["effect_skepticism", "trust_gap", "purchase_intent", "usage_question"],
    comment_operation_agent: ["usage_question", "dm_consult_signal", "safety_concern", "effect_skepticism"],
    ad_fit_agent: ["purchase_intent", "effect_skepticism", "negative_experience", "trust_gap"],
    report_assembly_agent: ["purchase_intent", "effect_skepticism", "trust_gap", "price_objection"],
    ai_quality_eval_agent: ["trust_gap", "effect_skepticism"]
  }[agentCode] ?? ["purchase_intent", "effect_skepticism", "trust_gap"];

  const evidence = preferredKeys.flatMap((key) => byKey.get(key) ?? []).slice(0, 6);
  return evidence.length > 0
    ? evidence
    : (insights.topComments ?? []).slice(0, 3).map((item) => ({
      comment_id: item.comment_id,
      comment_text: item.comment_text,
      evidence_type: item.evidence_type ?? "comment_signal"
    }));
}

function buildAgentSpecificResult({ agentCode, input, insights, evidence }) {
  const topSignals = (insights.signals ?? []).slice(0, 5).map((signal) => ({
    key: signal.key,
    label: signal.label,
    count: signal.count
  }));
  const topBarriers = insights.topBarriers ?? [];
  const conversionSignals = insights.conversionSignals ?? [];

  const base = {
    signal_taxonomy_version: insights.taxonomyVersion ?? "voc_signal_v0.2.0",
    top_signals: topSignals,
    evidence_count: evidence.length
  };

  if (agentCode === "task_goal_agent") {
    return {
      ...base,
      business_questions: input.value_questions ?? [],
      success_criteria: ["输出下周拍什么", "解释评论触发原因", "提炼购买障碍", "生成可派单脚本", "判断投流适配"],
      delivery_scope: "评论洞察、内容复盘、生产卡、评论区运营和投流建议"
    };
  }

  if (agentCode === "content_decomposition_agent") {
    return {
      ...base,
      content_diagnosis: {
        trigger_hypothesis: "内容用微晶透皮、黑科技、眼周急救等表达激发了机制好奇和效果追问。",
        missing_proof: topBarriers.map((signal) => signal.label),
        next_content_angle: "把原理解释、真人前后对比、适用人群和见效周期拆成下一条内容的主线。"
      }
    };
  }

  if (agentCode === "comment_dedup_agent") {
    return {
      ...base,
      dedup_summary: {
        retained_signal_comments: insights.classifiedComments ?? 0,
        total_comments: insights.totalComments ?? 0,
        rule: "保留带真实问题、购买障碍、效果追问和转化意图的评论，弱化纯表情/重复附和。"
      }
    };
  }

  if (agentCode === "spam_filter_agent") {
    return {
      ...base,
      valid_signal_ratio: insights.signalCoverage ?? 0,
      filtering_rules: ["纯表情和短附和降权", "作者批量回复单独标记", "保留带问题/阻力/意图的短评"]
    };
  }

  if (agentCode === "thread_cleanup_agent") {
    return {
      ...base,
      thread_patterns: ["用户先问效果/原理，后续回复承接试用和购买动作", "一级评论里的问题是评论运营的核心入口"],
      reply_context: "解析一级评论和引用评论后，回复需要围绕原问题补证据，而不是泛回复。"
    };
  }

  if (agentCode === "sentiment_depth_agent") {
    return {
      ...base,
      sentiment_layers: {
        curiosity: countSignal(insights, "ingredient_focus"),
        skepticism: countSignal(insights, "effect_skepticism") + countSignal(insights, "trust_gap"),
        purchase_readiness: countSignal(insights, "purchase_intent") + countSignal(insights, "dm_consult_signal")
      },
      emotional_drivers: ["对微晶透皮好奇", "对黑眼圈效果存疑", "想要真人反馈和见效周期"]
    };
  }

  if (agentCode === "high_value_comment_agent") {
    return {
      ...base,
      high_value_comments: evidence.map((item) => ({
        comment_id: item.comment_id,
        comment_text: item.comment_text,
        value_reason: item.evidence_type
      }))
    };
  }

  if (agentCode === "content_value_type_agent") {
    return {
      ...base,
      value_type: ["mechanism_education", "scenario_trigger", "problem_solution"],
      content_strengths: ["微晶透皮带来机制好奇", "黑眼圈场景明确", "女神节节点有囤货理由"],
      content_gaps: ["缺少前后对比", "缺少见效周期", "缺少敏感眼周安全边界"]
    };
  }

  if (agentCode === "platform_strategy_agent") {
    return {
      ...base,
      platform_strategy: {
        platform: input.platform ?? "unknown",
        traffic_objective: "先用证据型内容承接搜索/兴趣流，再小预算测试转化。",
        interaction_plan: ["置顶回答重度黑眼圈", "评论区收集眼周类型", "直播/私信承接链接和用法"]
      }
    };
  }

  if (agentCode === "need_barrier_agent") {
    return {
      ...base,
      purchase_barriers: topBarriers.map((signal) => ({
        key: signal.key,
        label: signal.label,
        count: signal.count,
        recommended_response: responseForBarrier(signal.key)
      }))
    };
  }

  if (agentCode === "content_comment_attribution_agent") {
    return {
      ...base,
      attribution: {
        why_comments_happened: "用户围绕原理、效果、适配和信任证据发问，说明内容激起兴趣但没有一次性解决转化疑虑。",
        content_elements: ["微晶透皮机制", "黑眼圈效果承诺", "眼周急救场景", "女神节节点"],
        comment_reaction_types: topSignals
      }
    };
  }

  if (agentCode === "production_card_agent") {
    return {
      ...base,
      production_card: {
        next_video_brief: "拍一条\u201c重度黑眼圈能不能用眼膜急救\u201d的证据型短视频。",
        script_outline: [
          "开头直接复述高频问题：重度黑眼圈有救吗？",
          "中段解释微晶透皮原理，用类比降低理解门槛。",
          "展示真人使用前后、见效周期和不适用人群。",
          "结尾引导评论区留下眼周问题，承接私信和直播间。"
        ],
        assignable_assets: ["真人前后对比", "成分/原理动效", "敏感肌测试说明", "评论截图证据"]
      }
    };
  }

  if (agentCode === "comment_operation_agent") {
    const replySuggestions = buildLabelReplySuggestions({ insights });
    return {
      ...base,
      comment_ops: {
        pinned_reply: "重度黑眼圈/熬夜眼周可以先看成因，想要见效周期和用法的姐妹我整理在置顶。",
        reply_playbook: replySuggestions.map((suggestion) => ({
          signal_key: suggestion.signal_key,
          signal_label: suggestion.signal_label,
          reply_goal: suggestion.reply_goal,
          suggested_reply: suggestion.suggested_reply,
          handoff_action: suggestion.dm_trigger
        })),
        label_reply_suggestions: replySuggestions,
        dm_triggers: conversionSignals.map((signal) => signal.label)
          .concat(replySuggestions.filter((item) => item.dm_trigger).map((item) => item.signal_label)),
        risk_controls: ["避免承诺绝对功效", "敏感眼周先提示测试和禁忌", "涉及价格先解释单次成本和适用边界"]
      }
    };
  }

  if (agentCode === "ad_fit_agent") {
    return {
      ...base,
      ad_fit: {
        decision: conversionSignals.length > 0 && topBarriers.length <= 4 ? "test_with_guardrails" : "needs_more_proof",
        reason: "存在购买意图，但效果怀疑和信任缺口需要用素材证明补齐。",
        required_before_scaling: ["前后对比素材", "功效边界说明", "评论区问题承接话术"]
      }
    };
  }

  if (agentCode === "pre_publish_check_agent") {
    return {
      ...base,
      publish_risks: ["功效表达需要边界", "安全与适用人群需要提前说明", "不能只讲黑科技不讲证据"],
      required_fixes: ["补真人前后对比", "补使用周期", "补评论区 FAQ"],
      go_no_go: "go_after_proof_assets_ready"
    };
  }

  if (agentCode === "report_assembly_agent") {
    return {
      ...base,
      executive_summary: "这条内容激发了效果怀疑、成分关注和购买意图，但转化前需要补齐见效证据与信任背书。",
      next_week_plan: ["重度黑眼圈急救实测", "微晶透皮原理解释", "敏感眼周能不能用", "眼霜 vs 透皮眼膜对比"],
      client_deliverables: ["专业复盘报告", "可派单脚本", "评论区 SOP", "投流前素材清单"]
    };
  }

  if (agentCode === "ai_quality_eval_agent") {
    return {
      ...base,
      quality_findings: ["输出已引用真实评论信号", "结构满足通用 JSON Schema", "仍需后续拆分专属 Agent Schema 提高渲染精度"],
      missing_evidence: evidence.length === 0 ? ["缺少评论证据"] : [],
      iteration_actions: ["为核心 Agent 增加专属 schema", "增加人工反馈闭环", "加入真实投流结果回填"]
    };
  }

  return {
    ...base,
    recommendation: "Use the signal pool to connect content diagnosis, buying barriers, next-video script, comment operation, and ad-fit decision."
  };
}

function countSignal(insights, key) {
  return (insights.signals ?? []).find((signal) => signal.key === key)?.count ?? 0;
}

function buildAgentSummary({ agent, insights }) {
  const top = (insights.signals ?? [])[0];
  if (!top) return `${agent.name} completed with no strong comment signal detected.`;
  return `${agent.name} completed. Top signal: ${top.label} (${top.count}/${insights.totalComments ?? 0}).`;
}

function responseForBarrier(key) {
  return {
    effect_skepticism: "补前后对比、见效周期和适用边界。",
    price_objection: "解释单次成本、核心技术差异和替代方案差异。",
    safety_concern: "给出眼周安全、敏感肌测试和禁忌说明。",
    trust_gap: "用真人案例、评论证据和第三方背书补信任。",
    audience_fit: "按黑眼圈类型、年龄、肤质给适配建议。"
  }[key] ?? "用证据型回复降低转化阻力。";
}

function buildLabelReplySuggestions({ insights }) {
  const signals = (insights.signals ?? []).slice(0, 13);
  return signals.map((signal, index) => {
    const sample = signal.evidence?.find((item) => item.comment_text) ?? {};
    const replyGoal = responseForBarrier(signal.key);
    return {
      signal_key: signal.key,
      signal_label: signal.label,
      sample_comment: sample.comment_text ?? `${signal.label}相关评论`,
      evidence_comment_id: sample.comment_id ?? "",
      reply_goal: replyGoal,
      suggested_reply: buildContextualReply({ signal, sampleComment: sample.comment_text, replyGoal }),
      tone: replyToneForSignal(signal.key),
      priority: index < 5 ? "P0" : index < 9 ? "P1" : "P2",
      dm_trigger: dmTriggerForSignal(signal.key)
    };
  });
}

function buildContextualReply({ signal, sampleComment, replyGoal }) {
  const prefix = sampleComment ? `你问的"${sampleComment}"很典型，` : `${signal.label}这个问题很多人都会卡住，`;
  return `${prefix}${replyGoal} 我们会优先补充真实使用周期、适用边界和评论区证据，方便你判断是否适合自己。`;
}

function replyToneForSignal(key) {
  return {
    purchase_intent: "快速承接，给下一步购买/咨询动作",
    price_objection: "解释成本，避免硬怼价格",
    effect_skepticism: "先共情怀疑，再补证据",
    safety_concern: "谨慎专业，先讲边界",
    usage_question: "步骤清晰，直接给用法",
    audience_fit: "分人群回答，不泛化",
    competitor_comparison: "客观对比，不攻击竞品",
    negative_experience: "先安抚，再收集细节",
    repurchase_signal: "强化复购理由，引导晒单",
    dm_consult_signal: "明确私信承接",
    scenario_need: "代入场景，给使用方案",
    ingredient_focus: "解释成分/原理，降低理解门槛",
    trust_gap: "补背书和证据，不空口承诺"
  }[key] ?? "专业、具体、证据优先";
}

function dmTriggerForSignal(key) {
  return {
    purchase_intent: "可引导私信领取购买/使用建议",
    usage_question: "复杂用法可引导私信发步骤图",
    audience_fit: "需要肤质/眼周情况判断时引导私信",
    safety_concern: "敏感/特殊人群建议私信确认禁忌",
    dm_consult_signal: "直接私信承接"
  }[key] ?? "";
}

function normalizeMockOutput(result) {
  return {
    summary: result.summary,
    evidence: result.evidence,
    result: result.payload,
    risk_flags: result.riskFlags,
    confidence_score: result.confidenceScore
  };
}

function normalizeProviderOutput(value, { agent, input, taskId, promptVersion, route }) {
  const output = value && typeof value === "object" ? value : {};
  if (output.summary && Array.isArray(output.evidence) && output.result) {
    return {
      summary: String(output.summary),
      evidence: output.evidence,
      result: output.result,
      risk_flags: Array.isArray(output.risk_flags) ? output.risk_flags : [],
      confidence_score: clampConfidence(output.confidence_score)
    };
  }

  return {
    summary: String(output.summary ?? `${agent.code} completed.`),
    evidence: Array.isArray(output.evidence) && output.evidence.length > 0
      ? output.evidence
      : [{ comment_id: "provider_output", comment_text: "Provider returned no explicit evidence.", evidence_type: "model_inference" }],
    result: output.result && typeof output.result === "object"
      ? output.result
      : {
        task_id: output.task_id ?? taskId,
        platform: input.platform ?? "unknown",
        content_goal: input.content_goal ?? "unknown",
        provider_payload: output,
        model: route.modelName,
        prompt_version: promptVersion
      },
    risk_flags: Array.isArray(output.risk_flags) ? output.risk_flags : [],
    confidence_score: clampConfidence(output.confidence_score)
  };
}

function clampConfidence(value) {
  const score = Number(value ?? 0.7);
  if (Number.isNaN(score)) return 0.7;
  return Math.min(1, Math.max(0, score));
}
