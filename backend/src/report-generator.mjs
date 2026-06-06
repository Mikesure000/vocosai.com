import { createId, now } from "./store.mjs";
import { COMMENT_SIGNAL_TAXONOMY, buildCommentInsights, listCommentSignalMatches } from "./comment-insights.mjs";
import { buildWorkbookXlsx } from "./xlsx-exporter.mjs";
import { buildTaskDisplayTitle, cleanDisplayText } from "./text-utils.mjs";

export async function generateTaskReport({ store, taskId, createdBy = "user_demo" }) {
  const task = store.get("tasks", taskId);
  if (!task) {
    const error = new Error(`tasks record not found: ${taskId}`);
    error.statusCode = 404;
    error.code = "not_found";
    throw error;
  }

  const commentFiles = store.list("commentFiles").filter((file) => file.taskId === taskId);
  const comments = store.list("comments").filter((comment) => comment.taskId === taskId);
  const runs = store.list("aiRuns")
    .filter((run) => run.taskId === taskId)
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
  const runSets = splitCurrentAndHistoricalRuns(runs);

  const markdown = buildMarkdownReport({ task, commentFiles, comments, runs });
  const reportTitle = `${formatTaskTitle(buildTaskDisplayTitle({ task, commentFiles }))} 报告`;
  const report = {
    id: createId("report"),
    taskId,
    teamId: task.teamId,
    projectId: task.projectId,
    title: reportTitle,
    format: "markdown",
    status: "generated",
    summary: buildReportSummary({ task, comments, runs: runSets.currentRuns, historicalRuns: runSets.historicalRuns }),
    markdown,
    metrics: buildReportMetrics({ comments, runs: runSets.currentRuns, allRuns: runs }),
    createdBy,
    createdAt: now(),
    updatedAt: now()
  };

  await store.insert("reports", report);
  return report;
}

export function summarizeReport(report) {
  return {
    id: report.id,
    taskId: report.taskId,
    title: report.title,
    format: report.format,
    status: report.status,
    summary: report.summary,
    metrics: report.metrics,
    createdAt: report.createdAt,
    createdBy: report.createdBy
  };
}

export function detailReport(report) {
  return {
    ...summarizeReport(report),
    markdown: report.markdown,
    markdownLength: String(report.markdown ?? "").length
  };
}

export function exportReport(report, format = "markdown", context = {}) {
  const versionDiff = buildReportVersionDiff(report, context);
  if (format === "html") {
    return {
      fileName: `${safeFileName(report.title || report.id)}.html`,
      contentType: "text/html; charset=utf-8",
      content: renderHtmlReport(report, { versionDiff })
    };
  }

  if (format === "xlsx" || format === "excel") {
    return {
      fileName: `${safeFileName(report.title || report.id)}_appendix.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content: buildWorkbookXlsx({ sheets: buildReportAppendixSheets(report, { ...context, versionDiff }) })
    };
  }

  return {
    fileName: `${safeFileName(report.title || report.id)}.md`,
    contentType: "text/markdown; charset=utf-8",
    content: appendMarkdownVersionDiff(report.markdown ?? "", versionDiff)
  };
}

function buildMarkdownReport({ task, commentFiles, comments, runs }) {
  const runSets = splitCurrentAndHistoricalRuns(runs);
  const metrics = buildReportMetrics({ comments, runs: runSets.currentRuns, allRuns: runs });
  const insights = buildCommentInsights({ comments });
  const latestRuns = latestSuccessfulRunsByAgent(runSets.currentRuns);
  const contentDiagnosis = latestRuns.get("content_decomposition_agent")?.outputJson?.result?.content_diagnosis ?? {};
  const productionCard = latestRuns.get("production_card_agent")?.outputJson?.result?.production_card ?? {};
  const commentOps = latestRuns.get("comment_operation_agent")?.outputJson?.result?.comment_ops ?? {};
  const adFit = latestRuns.get("ad_fit_agent")?.outputJson?.result?.ad_fit ?? {};
  const platformStrategy = latestRuns.get("platform_strategy_agent")?.outputJson?.result?.platform_strategy
    ?? { recommendation: latestRuns.get("platform_strategy_agent")?.outputJson?.result?.recommendation };
  const runLines = runSets.currentRuns.map((run) => [
    formatAgentName(run.agentName),
    formatProviderName(run.providerName),
    run.modelName,
    formatRunMode(run.executionMode),
    formatStatus(run.schemaValidationStatus),
    run.fallbackUsed ? "是" : "否",
    run.actualCost ?? 0
  ]);

  return [
    `# ${escapeMarkdown(formatTaskTitle(buildTaskDisplayTitle({ task, commentFiles, suffix: "" }) || "消费者之声分析报告"))}`,
    "",
    "## 1. 核心结论",
    "",
    `- 平台：${escapeMarkdown(formatPlatform(task.platform))}`,
    `- 已解析评论：${comments.length}`,
    `- 信号覆盖率：${Math.round((insights.signalCoverage ?? 0) * 100)}% (${insights.classifiedComments}/${insights.totalComments})`,
    `- 高频信号：${escapeMarkdown(formatSignalList(insights.signals.slice(0, 5)))}`,
    `- 为什么引发这些评论：${escapeMarkdown(localizeReportText(contentDiagnosis.trigger_hypothesis || latestRuns.get("content_decomposition_agent")?.outputJson?.summary || "待补充内容诊断。"))}`,
    `- 用户真正卡点：${escapeMarkdown(formatSignalList(insights.topBarriers) || "待补充购买障碍诊断。")}`,
    `- 下一条内容建议：${escapeMarkdown(localizeReportText(productionCard.next_video_brief || contentDiagnosis.next_content_angle || "待生成生产卡。"))}`,
    `- 是否适合投流：${escapeMarkdown(formatAdDecision(adFit))}`,
    "",
    "## 2. 任务上下文",
    "",
    `- 任务编号：${task.id}`,
    `- 平台：${formatPlatform(task.platform)}`,
    `- 状态：${formatStatus(task.status)}`,
    `- 内容标题：${escapeMarkdown(cleanDisplayText(task.contentTitle, "-"))}`,
    `- 内容目标：${escapeMarkdown(formatContentGoal(task.contentGoal))}`,
    "",
    "## 评论输入",
    "",
    `- 文件数：${commentFiles.length}`,
    `- 已解析评论：${comments.length}`,
    ...commentFiles.map((file) => `- ${escapeMarkdown(file.fileName)}：${file.rowCount ?? 0} 行，状态 ${formatStatus(file.parseStatus)}`),
    "",
    "## 3. 内容诊断",
    "",
    `- 触发原因：${escapeMarkdown(localizeReportText(contentDiagnosis.trigger_hypothesis || "-"))}`,
    `- 缺失证据：${escapeMarkdown(toTextList(contentDiagnosis.missing_proof) || "-")}`,
    `- 下一条内容角度：${escapeMarkdown(localizeReportText(contentDiagnosis.next_content_angle || "-"))}`,
    "",
    "## 4. 评论信号池",
    "",
    "| 信号 | 数量 | 证据样例 |",
    "| --- | ---: | --- |",
    ...insights.signals.slice(0, 12).map((signal) => `| ${escapeMarkdown(signal.label)} | ${signal.count} | ${escapeMarkdown((signal.evidence ?? []).slice(0, 3).map((item) => item.comment_text).join(" / "))} |`),
    "",
    "## 5. 用户障碍与转化信号",
    "",
    `- 购买障碍：${escapeMarkdown(formatSignalList(insights.topBarriers) || "-")}`,
    `- 转化信号：${escapeMarkdown(formatSignalList(insights.conversionSignals) || "-")}`,
    `- 内容钩子：${escapeMarkdown(formatSignalList(insights.contentHooks) || "-")}`,
    "",
    "## 6. 平台策略",
    "",
    ...objectOrTextToBullets(platformStrategy, ["recommendation", "summary", "platform_focus", "priority_actions", "risk_controls"]),
    "",
    "## 7. 可派单生产卡",
    "",
    `- 下条视频简报：${escapeMarkdown(localizeReportText(productionCard.next_video_brief || "-"))}`,
    "",
    "### 脚本大纲",
    "",
    ...arrayToBullets(productionCard.script_outline),
    "",
    "### 可交付素材",
    "",
    ...arrayToBullets(productionCard.assignable_assets),
    "",
    "## 8. 评论区运营方案",
    "",
    `- 置顶回复：${escapeMarkdown(commentOps.pinned_reply || "-")}`,
    "",
    "### 回复话术库",
    "",
    ...arrayToBullets((commentOps.reply_playbook ?? []).map((item) => `${formatSignalKey(item.signal)}：${localizeReportText(item.reply_goal)}`)),
    "",
    `- 私信触发条件：${escapeMarkdown(toTextList(commentOps.dm_triggers) || "-")}`,
    "",
    "## 9. 投流适配判断",
    "",
    `- 判断：${escapeMarkdown(formatAdDecisionLabel(adFit.decision))}`,
    `- 原因：${escapeMarkdown(localizeReportText(adFit.reason || "-"))}`,
    `- 放量前必须补充：${escapeMarkdown(localizeReportText(toTextList(adFit.required_before_scaling) || "-"))}`,
    "",
    "## 10. 证据高亮",
    "",
    ...buildEvidenceHighlights(runSets.currentRuns),
    "",
    "## 11. 智能治理附录",
    "",
    "### 智能体运行指标",
    "",
    `- 当前智能体运行：${metrics.runs}`,
    `- 历史重跑：${metrics.historicalRuns}`,
    `- 结构校验通过：${metrics.schemaPassed}`,
    `- 供应商尝试：${metrics.providerAttempts}`,
    `- 降级次数：${metrics.fallbackRuns}`,
    `- 总令牌：${metrics.totalTokens}`,
    `- 预估成本：${metrics.totalCost}`,
    "",
    "### 智能体结果",
    "",
    "| 智能体 | 供应商 | 模型 | 模式 | 结构校验 | 降级 | 成本 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...runLines.map((line) => `| ${line.map((value) => escapeMarkdown(String(value ?? "-"))).join(" | ")} |`),
    "",
    "### 输出摘要",
    "",
    ...runSets.currentRuns.map((run) => `- **${escapeMarkdown(formatAgentName(run.agentName))}**：${escapeMarkdown(localizeReportText(run.outputJson?.summary || "暂无摘要"))}`),
    "",
    "- 提示词和结构版本已记录在智能体运行日志中。",
    "- 供应商尝试和降级原因可在智能治理中心查看。",
    "- 本报告基于已持久化的任务、评论和智能体运行记录生成。"
  ].join("\n");
}

function buildReportSummary({ task, comments, runs, historicalRuns = [] }) {
  const passed = runs.filter((run) => run.schemaValidationStatus === "passed").length;
  const insights = buildCommentInsights({ comments });
  const topSignal = insights.signals[0];
  const history = historicalRuns.length > 0 ? ` 历史重跑 ${historicalRuns.length} 条。` : "";
  return `${formatPlatform(task.platform)}任务，已解析 ${comments.length} 条评论，最高频信号 ${topSignal ? `${topSignal.label} ${topSignal.count}` : "暂无"}，当前 ${passed}/${runs.length} 条智能体运行通过结构校验。${history}`;
}

function buildReportMetrics({ comments, runs, allRuns = runs }) {
  return {
    comments: comments.length,
    runs: runs.length,
    historicalRuns: Math.max(0, allRuns.length - runs.length),
    totalRuns: allRuns.length,
    schemaPassed: runs.filter((run) => run.schemaValidationStatus === "passed").length,
    providerAttempts: runs.reduce((sum, run) => sum + (Array.isArray(run.providerAttempts) ? run.providerAttempts.length : 0), 0),
    fallbackRuns: runs.filter((run) => run.fallbackUsed).length,
    totalTokens: runs.reduce((sum, run) => sum + Number(run.totalTokenCount ?? 0), 0),
    totalCost: Number(runs.reduce((sum, run) => sum + Number(run.actualCost ?? 0), 0).toFixed(6))
  };
}

function buildEvidenceHighlights(runs) {
  const evidence = [];
  for (const run of runs) {
    for (const item of run.outputJson?.evidence ?? []) {
      evidence.push(`- ${escapeMarkdown(item.comment_text || item.comment_id || "证据")}（${escapeMarkdown(formatAgentName(run.agentName))}）`);
      if (evidence.length >= 8) return evidence;
    }
  }
  return evidence.length > 0 ? evidence : ["- 暂无已记录证据。"];
}

function latestSuccessfulRunsByAgent(runs) {
  const latest = new Map();
  for (const run of runs) {
    if (run.status !== "success") continue;
    latest.set(run.agentName, run);
  }
  return latest;
}

function splitCurrentAndHistoricalRuns(runs) {
  const latestByAgent = latestSuccessfulRunsByAgent(runs);
  const currentIds = new Set(Array.from(latestByAgent.values()).map((run) => run.id));
  return {
    currentRuns: runs.filter((run) => currentIds.has(run.id)),
    historicalRuns: runs.filter((run) => !currentIds.has(run.id))
  };
}

function formatSignalList(signals) {
  return (signals ?? [])
    .map((signal) => `${signal.label ?? formatSignalKey(signal.key)} ${signal.count ?? 0}`)
    .join(" / ");
}

function formatAdDecision(adFit) {
  if (!adFit?.decision && !adFit?.reason) return "待补充投流判断。";
  return [formatAdDecisionLabel(adFit.decision), localizeReportText(adFit.reason)].filter(Boolean).join(" - ");
}

function objectOrTextToBullets(value, preferredKeys = []) {
  if (!value) return ["- 待补充策略输出。"];
  if (typeof value === "string") return [`- ${escapeMarkdown(value)}`];

  const lines = [];
  for (const key of preferredKeys) {
    const item = value[key];
    if (item == null || item === "") continue;
    lines.push(`- ${escapeMarkdown(formatStrategyKey(key))}：${escapeMarkdown(localizeReportText(toTextList(item)))}`);
  }
  return lines.length > 0 ? lines : ["- 待补充策略输出。"];
}

function arrayToBullets(value) {
  const items = Array.isArray(value) ? value : [];
  return items.length > 0
    ? items.map((item) => `- ${escapeMarkdown(localizeReportText(typeof item === "string" ? item : JSON.stringify(item)))}`)
    : ["- 待补充输出。"];
}

function toTextList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(" / ");
  }
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

function titleizeKey(key) {
  return String(key)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatPlatform(platform) {
  return {
    xiaohongshu: "小红书",
    douyin: "抖音"
  }[platform] ?? String(platform ?? "-");
}

function formatStatus(status) {
  return {
    draft: "草稿",
    uploaded: "已上传",
    mapping_required: "待确认字段",
    ready: "就绪",
    analyzing: "分析中",
    partially_failed: "部分失败",
    failed: "失败",
    completed: "已完成",
    exported: "已导出",
    archived: "已归档",
    parsed: "已解析",
    generated: "已生成",
    success: "成功",
    passed: "通过",
    active: "已启用",
    inactive: "未启用",
    skipped: "已跳过",
    live: "真实调用",
    mock: "模拟",
    mock_fallback: "模拟兜底"
  }[status] ?? String(status ?? "-");
}

function formatAgentName(agentName) {
  return {
    task_goal_agent: "任务理解与目标识别",
    content_decomposition_agent: "原内容拆解",
    comment_dedup_agent: "评论去重清洗",
    spam_filter_agent: "水军与无效评论过滤",
    thread_cleanup_agent: "多轮对话清洗",
    sentiment_depth_agent: "情感深度分析",
    high_value_comment_agent: "高价值评论筛选",
    need_barrier_agent: "用户需求与购买障碍识别",
    content_comment_attribution_agent: "内容-评论归因",
    content_value_type_agent: "内容价值类型识别",
    platform_strategy_agent: "平台策略生成",
    production_card_agent: "内容生产卡生成",
    comment_operation_agent: "评论区运营",
    ad_fit_agent: "投流适配评分",
    pre_publish_check_agent: "发布前质检",
    report_assembly_agent: "报告组装",
    ai_quality_eval_agent: "智能质量评估"
  }[agentName] ?? String(agentName ?? "-");
}

function formatProviderName(providerName) {
  return {
    deepseek: "DeepSeek",
    openai: "OpenAI"
  }[providerName] ?? String(providerName ?? "-");
}

function formatRunMode(mode) {
  return {
    live: "真实调用",
    mock: "模拟",
    mock_fallback: "模拟兜底",
    blocked: "已拦截"
  }[mode] ?? formatStatus(mode);
}

function formatSignalKey(signalKey) {
  return {
    purchase_intent: "购买意图",
    price_objection: "价格异议",
    effect_skepticism: "效果怀疑",
    safety_concern: "安全担忧",
    usage_question: "使用疑问",
    audience_fit: "人群适配",
    competitor_comparison: "竞品比较",
    negative_experience: "负面体验",
    repurchase_signal: "复购信号",
    dm_consult_signal: "私信咨询信号",
    scenario_need: "场景需求",
    ingredient_focus: "成分关注",
    trust_gap: "信任缺口"
  }[signalKey] ?? String(signalKey ?? "-");
}

function formatAdDecisionLabel(decision) {
  return {
    scale: "可以放量",
    test: "建议小预算测试",
    needs_more_proof: "需要补充证据后再投",
    not_ready_to_promote: "暂不适合放量",
    no_go: "不建议投流"
  }[decision] ?? (decision ? String(decision) : "-");
}

function formatStrategyKey(key) {
  return {
    recommendation: "策略建议",
    summary: "策略摘要",
    platform_focus: "平台重点",
    priority_actions: "优先动作",
    risk_controls: "风险控制"
  }[key] ?? titleizeKey(key);
}

function formatMetricName(key) {
  return {
    comments: "评论数",
    runs: "当前智能体运行数",
    historicalRuns: "历史重跑数",
    totalRuns: "总运行数",
    schemaPassed: "结构校验通过数",
    providerAttempts: "供应商尝试数",
    fallbackRuns: "降级次数",
    totalTokens: "总令牌",
    totalCost: "总成本"
  }[key] ?? String(key ?? "-");
}

function formatTaskTitle(title) {
  return {
    "local-live-deepseek-xlsx-smoke": "本地 DeepSeek 表格实测",
    "local-xlsx-smoke": "本地表格解析测试",
    "AI Run log pipeline": "智能体运行日志流水线"
  }[title] ?? String(title ?? "消费者之声分析报告");
}

function formatContentGoal(goal) {
  return {
    comment_analysis: "评论分析",
    seed_interest: "种草收藏",
    conversion: "转化",
    ad_fit: "投流判断"
  }[goal] ?? cleanDisplayText(goal, "-");
}

function localizeReportText(value) {
  const replacements = [
    [/\bconditional purchase intent but is blocked by unaddressed\b/g, "存在有条件购买意图，但被未解决的"],
    [/\bmaking it not publish-ready without fixes\b/g, "因此未修复前不适合发布"],
    [/\bComment analysis report for Douyin ad about micro-crystal eye mask\b/g, "抖音微晶眼膜广告评论分析报告"],
    [/\bneed for proof of efficacy\b/g, "功效证据需求"],
    [/\bConversion hinges on\b/g, "转化关键在于"],
    [/\bComment insights output is evidence-grounded, schema-valid, and actionable\b/g, "评论洞察输出基于证据、结构校验通过且可执行"],
    [/\bAll signals are supported by concrete comment examples, taxonomy labels are applied correctly, and the derived barriers, conversion signals, and hooks provide clear value for content strategy iteration\b/g, "所有信号均有具体评论样例支撑，标签体系应用正确；沉淀出的用户障碍、转化信号和内容钩子可直接支持下一轮内容策略迭代"],
    [/\bnot_ready_to_promote\b/g, "暂不适合放量"],
    [/\bneeds_more_proof\b/g, "需要补充证据"],
    [/\beffect_skepticism\b/g, "效果怀疑"],
    [/\bingredient_focus\b/g, "成分关注"],
    [/\bpurchase_intent\b/g, "购买意图"],
    [/\btrust_gap\b/g, "信任缺口"],
    [/\baudience_fit\b/g, "人群适配"],
    [/\bHigh effect skepticism\b/g, "效果怀疑较高"],
    [/\bStrong effect skepticism\b/g, "效果怀疑较强"],
    [/\beffect skepticism\b/g, "效果怀疑"],
    [/\btrust gaps\b/g, "信任缺口"],
    [/\btrust gap\b/g, "信任缺口"],
    [/\bSafety concerns\b/g, "安全担忧"],
    [/\bsafety concerns\b/g, "安全担忧"],
    [/\bsafety clarity\b/g, "安全说明"],
    [/\baudience fit questions\b/g, "人群适配问题"],
    [/\baudience definition\b/g, "人群定义"],
    [/\bPrice objection is minor but present\b/g, "价格异议较少但仍存在"],
    [/\bContent needs stronger proof before scaling\b/g, "放量前需要更强证据支撑"],
    [/\bingredient curiosity\b/g, "成分/技术好奇"],
    [/\bunderlying purchase intent\b/g, "潜在购买意图"],
    [/\bUsers seek real results, safety reassurance, and compare to existing eye creams\b/g, "用户需要真实效果、安全背书，并会与现有眼霜对比"],
    [/\bUsers seek\b/g, "用户需要"],
    [/\breal results\b/g, "真实效果"],
    [/\bsafety reassurance\b/g, "安全背书"],
    [/\bcompare to existing eye creams\b/g, "与现有眼霜对比"],
    [/\bScenario needs\b/g, "场景需求"],
    [/\bpresent conversion opportunities\b/g, "带来转化机会"],
    [/\bAdd before\/after visual proof or real user testimonials\b/g, "补充前后对比视觉证据或真实用户证言"],
    [/\bAddress safety of micro-needle technology with expert or clinical data\b/g, "用专家或检测数据解释微晶技术安全性"],
    [/\bClarify efficacy speed and for which types of dark circles\b/g, "明确见效周期和适用黑眼圈类型"],
    [/\bShow usage instructions and skincare compatibility\b/g, "展示使用方法和护肤搭配兼容性"],
    [/\bReinforce price-value comparison with concrete numbers\b/g, "用具体数字强化价格-价值对比"],
    [/\bFiltered out\b/g, "已过滤"],
    [/\blow-value emoji-only\b/g, "低价值纯表情"],
    [/\bfrom topComments\b/g, "来自高赞评论"],
    [/\bretaining all other classified signals\b/g, "保留其他已归类信号"],
    [/\bvalid consumer insights\b/g, "有效消费者洞察"],
    [/\bComment analysis report for Douyin\b/g, "抖音评论分析报告"],
    [/\bComment analysis reveals high\b/g, "评论分析显示较高"],
    [/\bComment analysis reveals strong\b/g, "评论分析显示较强"],
    [/\bComment insights output\b/g, "评论洞察输出"],
    [/\bContent shows strong\b/g, "内容呈现较强"],
    [/\bKey barriers\b/g, "关键障碍"],
    [/\bTop signals\b/g, "高频信号"],
    [/\bHook\b/g, "开场钩子"],
    [/\bCTA\b/g, "行动引导"],
    [/\bconversion signals\b/g, "转化信号"],
    [/\bconversion handoff\b/g, "转化承接"],
    [/\bConversion hinges\b/g, "转化关键在于"],
    [/\bcredible before\/after evidence\b/g, "可信前后对比证据"],
    [/\bconcrete comment examples\b/g, "具体评论样例"],
    [/\bevidence-grounded\b/g, "基于证据"],
    [/\bschema-valid\b/g, "结构校验通过"],
    [/\bnot publish-ready without fixes\b/g, "未修复前不适合发布"],
    [/\bNot ready for promotion until these barriers are reduced\b/g, "这些障碍降低前不适合投流"],
    [/\bthe script lacks proof\b/g, "脚本缺少证据"],
    [/\btech education\b/g, "技术教育"],
    [/\bAll signals are supported\b/g, "所有信号均有证据支撑"],
    [/\btaxonomy labels are applied correctly\b/g, "标签体系应用正确"],
    [/\bhooks provide clear value for content strategy iteration\b/g, "钩子为内容策略迭代提供明确价值"],
    [/\babout micro-crystal eye mask\b/g, "关于微晶眼膜"],
    [/\bneed for proof\b/g, "证据需求"],
    [/\befficacy\b/g, "功效"],
    [/\beye mask\b/g, "眼膜"],
    [/\bcounts\b/g, "次"],
    [/\bcomments\b/g, "条评论"],
    [/\bconditional\b/g, "有条件"],
    [/\bpurchase intent\b/g, "购买意图"],
    [/\bblock\b/g, "阻碍"],
    [/\bblocked\b/g, "被阻碍"],
    [/\bremain unresolved\b/g, "仍未解决"],
    [/\bunaddressed\b/g, "未解决"],
    [/\bclassified\b/g, "已归类"],
    [/\banalyzed\b/g, "已分析"],
    [/\bactionable\b/g, "可执行"],
    [/\band\b/g, "和"]
  ];
  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), String(value ?? ""));
}

function buildReportAppendixSheets(report, context = {}) {
  const sections = parseMarkdownSections(report.markdown);
  const sheets = [
    {
      name: "报告总览",
      rows: [
        ["字段", "值"],
        ["报告编号", report.id],
        ["任务编号", report.taskId],
        ["标题", report.title],
        ["摘要", report.summary],
        ["状态", formatStatus(report.status)],
        ["创建人", report.createdBy],
        ["创建时间", report.createdAt]
      ]
    },
    {
      name: "指标",
      rows: [
        ["指标", "值"],
        ...Object.entries(report.metrics ?? {}).map(([key, value]) => [formatMetricName(key), value])
      ]
    },
    {
      name: "章节摘要",
      rows: [
        ["章节", "内容"],
        ...Array.from(sections.entries()).map(([section, content]) => [section, content.slice(0, 3000)])
      ]
    }
  ];
  const signalRows = buildReportSignalDetailRows({ report, store: context.store });
  if (signalRows.length > 1) {
    sheets.push({
      name: "评论信号明细",
      rows: signalRows
    });
  }
  const diffRows = buildReportVersionDiffRows(context.versionDiff);
  if (diffRows.length > 1) {
    sheets.push({
      name: "版本差异",
      rows: diffRows
    });
  }
  return sheets;
}

function buildReportSignalDetailRows({ report, store }) {
  const comments = store?.list?.("comments")?.filter((comment) => comment.taskId === report.taskId) ?? [];
  const rows = [["信号编码", "信号标签", "信号说明", "评论编号", "点赞数", "评论正文"]];
  for (const taxonomy of COMMENT_SIGNAL_TAXONOMY) {
    const matches = listCommentSignalMatches({
      comments,
      signalKey: taxonomy.key,
      limit: 100000,
      offset: 0
    });
    for (const comment of matches.comments) {
      rows.push([
        taxonomy.key,
        taxonomy.label,
        taxonomy.description,
        comment.comment_id,
        comment.like_count ?? 0,
        comment.comment_text
      ]);
    }
  }
  return rows;
}

function buildReportVersionDiff(report, context = {}) {
  const compareReport = context.compareReport ?? findDefaultCompareReport(report, context.store);
  if (!compareReport?.markdown) return null;
  const currentSections = parseMarkdownSections(report.markdown);
  const previousSections = parseMarkdownSections(compareReport.markdown);
  const groups = getReportDiffGroups().map((group) => {
    const changes = group.sections.flatMap((section) => {
      const sectionDiff = diffSectionLines(
        getSectionContent(currentSections, section.title),
        getSectionContent(previousSections, section.title)
      );
      return [
        ...sectionDiff.added.map((line) => ({ type: "added", section: section.label, line })),
        ...sectionDiff.removed.map((line) => ({ type: "removed", section: section.label, line }))
      ];
    }).slice(0, 12);
    return { ...group, changes };
  });
  return {
    reportId: report.id,
    compareReportId: compareReport.id,
    compareReportCreatedAt: compareReport.createdAt,
    changedGroupCount: groups.filter((group) => group.changes.length > 0).length,
    totalGroupCount: groups.length,
    groups
  };
}

function findDefaultCompareReport(report, store) {
  const reports = store?.list?.("reports")?.filter((item) =>
    item.taskId === report.taskId &&
    item.id !== report.id &&
    item.markdown
  ) ?? [];
  const older = reports
    .filter((item) => String(item.createdAt ?? "") < String(report.createdAt ?? ""))
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  if (older.length > 0) return older[0];
  return reports.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))[0] ?? null;
}

function getReportDiffGroups() {
  return [
    {
      label: "核心结论",
      intent: "回答这条内容为什么引发这些评论。",
      sections: [
        { title: ["1. 核心结论", "1. Executive Summary"], label: "核心结论" },
        { title: ["3. 内容诊断", "3. Content Diagnosis"], label: "内容诊断" }
      ]
    },
    {
      label: "用户障碍",
      intent: "回答用户真正卡在哪里。",
      sections: [
        { title: ["4. 评论信号池", "4. Comment Signal Pool"], label: "评论信号池" },
        { title: ["5. 用户障碍与转化信号", "5. User Barriers and Conversion Signals"], label: "障碍与转化信号" }
      ]
    },
    {
      label: "下条内容",
      intent: "回答下周拍什么、下一条内容怎么拍。",
      sections: [
        { title: ["6. 平台策略", "6. Platform Strategy"], label: "平台策略" },
        { title: ["7. 可派单生产卡", "7. Assignable Production Card"], label: "生产卡" }
      ]
    },
    {
      label: "脚本派单",
      intent: "回答脚本怎么写，是否可以直接派单。",
      sections: [
        { title: ["7. 可派单生产卡", "7. Assignable Production Card"], label: "生产卡" }
      ]
    },
    {
      label: "评论运营",
      intent: "回答评论区怎么运营。",
      sections: [
        { title: ["8. 评论区运营方案", "8. Comment Operation Plan"], label: "评论运营方案" }
      ]
    },
    {
      label: "投流判断",
      intent: "回答这条内容能不能投流。",
      sections: [
        { title: ["9. 投流适配判断", "9. Paid Traffic Fit"], label: "投流适配" }
      ]
    }
  ];
}

function diffSectionLines(current = "", previous = "") {
  const currentLines = normalizeDiffLines(current);
  const previousLines = normalizeDiffLines(previous);
  const previousSet = new Set(previousLines);
  const currentSet = new Set(currentLines);
  return {
    added: currentLines.filter((line) => !previousSet.has(line)).slice(0, 6),
    removed: previousLines.filter((line) => !currentSet.has(line)).slice(0, 6)
  };
}

function getSectionContent(sections, titleOrTitles) {
  const titles = Array.isArray(titleOrTitles) ? titleOrTitles : [titleOrTitles];
  for (const title of titles) {
    const content = sections.get(title);
    if (content) return content;
  }
  return "";
}

function normalizeDiffLines(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-#|\s]+/, "").replace(/\|/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line && !/^---/.test(line) && !/^Signal Count/.test(line));
}

function buildReportVersionDiffRows(versionDiff) {
  const rows = [["报告编号", "对比报告编号", "模块", "业务问题", "变化数", "变化类型", "章节", "内容"]];
  if (!versionDiff) return rows;
  for (const group of versionDiff.groups ?? []) {
    if (!group.changes?.length) {
      rows.push([versionDiff.reportId, versionDiff.compareReportId, group.label, group.intent, 0, "无变化", "", ""]);
      continue;
    }
    for (const change of group.changes) {
      rows.push([
        versionDiff.reportId,
        versionDiff.compareReportId,
        group.label,
        group.intent,
        group.changes.length,
        change.type === "added" ? "新增" : "上一版有",
        change.section,
        change.line
      ]);
    }
  }
  return rows;
}

function appendMarkdownVersionDiff(markdown, versionDiff) {
  if (!versionDiff) return markdown;
  const lines = [
    markdown,
    "",
    "## 12. 版本结论差异",
    "",
    `- 对比报告：${versionDiff.compareReportId}`,
    `- 变化模块：${versionDiff.changedGroupCount}/${versionDiff.totalGroupCount}`,
    "",
    ...versionDiff.groups.flatMap((group) => [
      `### ${group.label}`,
      "",
      `- 业务问题：${group.intent}`,
      ...(group.changes.length
        ? group.changes.map((change) => `- ${change.type === "added" ? "新增" : "上一版有"} / ${change.section}: ${escapeMarkdown(change.line)}`)
        : ["- 关键结论无明显变化。"]),
      ""
    ])
  ];
  return lines.join("\n");
}

function parseMarkdownSections(markdown) {
  const sections = new Map();
  const lines = String(markdown ?? "").split(/\r?\n/);
  let current = "报告";
  let buffer = [];
  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      if (buffer.length > 0) sections.set(current, buffer.join("\n").trim());
      current = match[1].trim();
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length > 0) sections.set(current, buffer.join("\n").trim());
  return sections;
}

function escapeMarkdown(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderHtmlReport(report, { versionDiff = null } = {}) {
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(report.title || "Vocos 报告")}</title>`,
    "<style>",
    "body{font-family:Inter,Segoe UI,Microsoft YaHei,sans-serif;margin:0;background:#f6f7f6;color:#18201d;}",
    "main{max-width:980px;margin:0 auto;padding:32px 24px;}",
    "article{background:#fff;border:1px solid #dfe6e2;border-radius:6px;padding:24px;}",
    "h1{font-size:28px;margin:0 0 8px;} p{color:#68736f;line-height:1.6;}",
    ".diff{margin:18px 0;padding:16px;border:1px solid #dfe6e2;border-radius:6px;background:#fbfcfb;}",
    ".diff-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}",
    ".diff-group{border:1px solid #dfe6e2;border-radius:6px;background:#fff;padding:12px;}",
    ".diff-group.changed{border-color:rgba(20,125,111,.32);}",
    ".diff-group h3{display:flex;justify-content:space-between;gap:12px;margin:0 0 6px;font-size:16px;}",
    ".diff-group small{color:#68736f;display:block;margin-bottom:8px;}",
    ".added,.removed,.none{margin:6px 0;padding:8px 10px;border-radius:6px;font-size:13px;line-height:1.45;}",
    ".added{background:#f0faf7;border:1px solid rgba(20,125,111,.22);color:#0f665b;}",
    ".removed{background:#fff5f5;border:1px solid rgba(179,73,73,.22);color:#8f3434;}",
    ".none{background:#f6f7f6;color:#68736f;}",
    "pre{white-space:pre-wrap;line-height:1.55;background:#101614;color:#eef4f1;padding:18px;border-radius:6px;overflow:auto;}",
    "</style>",
    "</head>",
    "<body><main><article>",
    `<h1>${escapeHtml(report.title || "Vocos 报告")}</h1>`,
    `<p>${escapeHtml(report.summary || "")}</p>`,
    renderHtmlVersionDiff(versionDiff),
    `<pre>${escapeHtml(report.markdown || "")}</pre>`,
    "</article></main></body></html>"
  ].join("");
}

function renderHtmlVersionDiff(versionDiff) {
  if (!versionDiff) return "";
  return [
    '<section class="diff">',
    "<h2>版本结论差异</h2>",
    `<p>相比报告 ${escapeHtml(versionDiff.compareReportId)}，本次有 ${versionDiff.changedGroupCount}/${versionDiff.totalGroupCount} 个业务模块出现结论变化。</p>`,
    '<div class="diff-grid">',
    ...(versionDiff.groups ?? []).map((group) => [
      `<section class="diff-group ${group.changes.length ? "changed" : ""}">`,
      `<h3><span>${escapeHtml(group.label)}</span><span>${group.changes.length} 处变化</span></h3>`,
      `<small>${escapeHtml(group.intent)}</small>`,
      ...(group.changes.length
        ? group.changes.map((change) => `<p class="${change.type === "added" ? "added" : "removed"}"><strong>${escapeHtml(change.section)}</strong><br>${change.type === "added" ? "新增：" : "上一版有："}${escapeHtml(change.line)}</p>`)
        : ['<p class="none">该模块暂无结论变化。</p>']),
      "</section>"
    ].join("")),
    "</div>",
    "</section>"
  ].join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeFileName(value) {
  return String(value ?? "report")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}
