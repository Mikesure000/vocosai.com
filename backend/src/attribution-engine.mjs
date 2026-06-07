// ============================================================
// 内容-评论归因引擎 — 建立"内容要点→用户评论反应"的因果链
// ============================================================

import { getAgentByCode } from "./agents.mjs";

/**
 * 归因引擎：核心 6 步推理流程
 *
 * 1. 内容要点提取 — 将原内容拆解为独立单元（钩子/卖点1/卖点2/CTA...）
 * 2. 评论-要点匹配 — 每条高价值评论匹配到其回应的内容要点
 * 3. 反应分类 — positive(正面)/negative(质疑)/question(追问)/action(转化)/mixed(复合)
 * 4. 需求/障碍推断 — 从用户反应中提取显性/隐性需求和购买障碍
 * 5. 影响度量化 — 基于评论量+点赞+关键词强度计算 impact_score(1-10)
 * 6. 洞察生成 — 为每个要点生成因果推断式洞察文本
 *
 * @param {Object} input
 * @param {string} input.taskId — 任务ID
 * @param {Object} input.content — 原内容信息 { title, body, platform }
 * @param {Object} input.signals — 评论信号 { signals:[], topBarriers:[], comments:[] }
 * @param {Object} input.categoryKnowledge — 品类知识库
 * @param {Function} input.llmCall — LLM调用函数 (model, messages) => response
 * @returns {Object} { contentPoints, attributionMatrix, contentGaps, sellingPointRanking }
 */
export async function runAttribution(input) {
  const { content, signals, categoryKnowledge, llmCall } = input;
  const agent = getAgentByCode("content_comment_attribution_agent");
  const model = agent?.defaultModel || "deepseek-v4-pro";

  // Step 1: 提取内容要点
  const contentPoints = extractContentPoints(content, llmCall, model);

  // Step 2-3: 对每个要点进行评论匹配和反应分类
  const attributionMatrix = buildAttributionMatrix(contentPoints, signals, llmCall, model);

  // Step 4-5: 需求/障碍推断 + 影响度量化
  const enriched = enrichWithDemandsAndScoring(attributionMatrix, signals, categoryKnowledge, llmCall, model);

  // Step 6: 生成洞察文本 + 基础校验
  const enrichmentPass = await generateInsightsWithLLM(enriched, content, categoryKnowledge, llmCall, model);
  const insights = mergeWithFallback(enriched, enrichmentPass);

  // 生成附加输出
  const contentGaps = extractContentGaps(insights, categoryKnowledge);
  const sellingPointRanking = rankSellingPoints(insights);

  return {
    contentPoints,
    attributionMatrix: insights,
    contentGaps,
    sellingPointRanking,
    _metadata: { model, pointCount: contentPoints.length, matrixSize: insights.length }
  };
}

// ===== Step 1: 内容要点提取 =====
function extractContentPoints(content, llmCall, model) {
  // 基于规则先提取基础要点，后续 LLM 增强
  const basePoints = [];
  const body = content.body || content.title || "";

  // 规则：信号词识别 + 位置标记
  const patterns = [
    { key: "hook", pattern: /开头|前3秒|前5秒|刚刷到|第一条/, position: "开头" },
    { key: "selling_point", pattern: /成分|技术|功效|效果|价值|贵在|多少钱/, position: "中段" },
    { key: "selling_point", pattern: /叠加|搭配|使用方式|步骤|怎么用/, position: "中段" },
    { key: "proof", pattern: /实测|对比|案例|反馈|实验室|数据/, position: "中段" },
    { key: "cta", pattern: /评论|收藏|关注|下单|链接|私信/, position: "结尾" },
    { key: "identity", pattern: /谁适合|人群|肤质|适合.*用|不适合/, position: "中段" },
    { key: "platform_hook", pattern: /抖音|小红书|种草|避坑/, position: "全篇" }
  ];

  let idx = 0;
  for (const p of patterns) {
    if (p.pattern.test(body)) {
      basePoints.push({
        id: `cp_${++idx}`,
        type: p.key,
        position: p.position,
        text: extractRelevantSentence(body, p.pattern),
        matchedKeywords: body.match(p.pattern)?.[0] || ""
      });
      if (basePoints.length >= 8) break;
    }
  }

  // 如果规则没提取任何要点，创建默认要点
  if (basePoints.length === 0) {
    basePoints.push(
      { id: "cp_1", type: "hook", position: "开头", text: content.title || "标题", matchedKeywords: "" },
      { id: "cp_2", type: "selling_point", position: "中段", text: body.slice(0, 200), matchedKeywords: "" }
    );
  }

  return basePoints;
}

// ===== Steps 2-3: 评论-要点匹配 + 反应分类 =====
function buildAttributionMatrix(contentPoints, signals, llmCall, model) {
  const matrix = [];
  const comments = signals.comments || [];

  for (const point of contentPoints) {
    // 找到与该要点相关的评论
    const relatedComments = findRelatedComments(point, comments, signals.signals || []);
    if (relatedComments.length === 0) continue;

    // 分析反应类型
    const reactionBreakdown = analyzeReactions(relatedComments);

    matrix.push({
      contentPointId: point.id,
      contentPointText: point.text,
      reactionType: dominantReaction(reactionBreakdown),
      reactionCount: relatedComments.length,
      sentimentDistribution: {
        positive: reactionBreakdown.positive.length,
        negative: reactionBreakdown.negative.length,
        neutral: reactionBreakdown.neutral.length
      },
      representativeComments: extractRepresentativeComments(relatedComments, 3),
      demandSignals: [],
      barrierSignals: [],
      impactScore: 0, // will be calculated later
      insightText: ""
    });
  }

  return matrix;
}

// 找到与内容要点相关的评论
function findRelatedComments(point, comments, signalData) {
  const keywords = point.matchedKeywords ? point.matchedKeywords.split(/[\s,，、]+/).filter(Boolean) : [];
  if (keywords.length === 0) return comments.slice(0, 5);

  // 关键词 + 信号维度联合匹配
  return comments.filter(c => {
    const text = (c.commentText || c.content || c.text || "").toLowerCase();
    if (keywords.some(kw => text.includes(kw.toLowerCase()))) return true;

    // 信号维度匹配：高价值评论的信号
    const signalKeys = c.signalKeys || c.labels || [];
    const pointType = point.type;
    if (pointType === "hook" && signalKeys.some(k => ["hook_format", "attention_hook"].includes(k))) return true;
    if (pointType === "price" && signalKeys.some(k => ["price_objection", "purchase_intent"].includes(k))) return true;
    if (pointType === "selling_point" && signalKeys.some(k => ["effect_skepticism", "ingredient_focus"].includes(k))) return true;
    if (pointType === "trust" && signalKeys.some(k => ["trust_gap", "safety_concern"].includes(k))) return true;

    return false;
  });
}

// 分析用户反应
function analyzeReactions(comments) {
  const result = { positive: [], negative: [], neutral: [] };

  for (const c of comments) {
    const text = (c.commentText || c.content || c.text || "").toLowerCase();

    // 积极信号
    if (/好|喜欢|推荐|买了|种草|不错|有效|回购/.test(text)) {
      result.positive.push(c);
    }
    // 质疑/负面信号
    else if (/贵|智商税|骗|没用|效果|假|伤|过敏/.test(text)) {
      result.negative.push(c);
    }
    // 追问信号
    else if (/怎么|能不能|适合|吗？|呢？|可不可以/.test(text)) {
      result.neutral.push(c);
    }
    // 默认归为中立
    else {
      result.neutral.push(c);
    }
  }

  return result;
}

function dominantReaction(breakdown) {
  const max = Math.max(breakdown.positive.length, breakdown.negative.length, breakdown.neutral.length);
  if (max === breakdown.positive.length) return "positive";
  if (max === breakdown.negative.length) return "negative";
  return "question";
}

function extractRepresentativeComments(comments, count) {
  return comments
    .sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0))
    .slice(0, count)
    .map(c => ({
      commentId: c.id || c.commentId,
      text: c.commentText || c.content || c.text || "",
      likeCount: c.likeCount || 0
    }));
}

// ===== Steps 4-5: 需求/障碍推断 + 影响度量化 =====
function enrichWithDemandsAndScoring(matrix, signals, categoryKnowledge, llmCall, model) {
  const barriers = signals.topBarriers || [];
  const conversionSignals = signals.conversionSignals || [];
  const needs = categoryKnowledge?.needTaxonomy || [];
  const barrierTaxonomy = categoryKnowledge?.barrierTaxonomy || [];

  for (const item of matrix) {
    // 需求推断：从品类知识库匹配
    const matchedNeeds = needs.filter(n =>
      item.representativeComments.some(c =>
        (c.text || "").includes(n.label) || (n.description || "").includes(item.contentPointText?.slice(0, 10))
      )
    ).slice(0, 3);

    item.demandSignals = matchedNeeds.map(n => ({
      demandCode: n.code,
      demandLabel: n.label,
      strength: Math.min(5, Math.ceil(item.reactionCount / 5))
    }));

    // 障碍推断
    const matchedBarriers = barrierTaxonomy.filter(b =>
      barrierRelatedToItem(item, b, barriers)
    ).slice(0, 3);

    item.barrierSignals = matchedBarriers.map(b => ({
      barrierCode: b.code,
      barrierLabel: b.label,
      strength: item.reactionType === "negative" ? "high" : "medium"
    }));

    // 影响度评分：评论量(0-4分) + 点赞量(0-3分) + 负面占比(0-3分)
    let score = Math.min(4, item.reactionCount / 10);
    const totalLikes = item.representativeComments.reduce((s, c) => s + (c.likeCount || 0), 0);
    score += Math.min(3, totalLikes / 50);
    if (item.sentimentDistribution.negative > item.sentimentDistribution.positive) score += 2;
    item.impactScore = Math.min(10, Math.round(score * 10) / 10);
  }

  // 按影响度排序
  matrix.sort((a, b) => b.impactScore - a.impactScore);

  return matrix;
}

function barrierRelatedToItem(item, barrier, systemBarriers) {
  // 内容要点文本或评论中是否提到该障碍
  const text = item.contentPointText + " " + item.representativeComments.map(c => c.text).join(" ");
  if (text.includes(barrier.label)) return true;
  // 系统识别的障碍信号
  return systemBarriers.some(b => b.key === barrier.code || b.label === barrier.label);
}

// ===== Step 6: 洞察生成 (LLM增强) =====
async function generateInsightsWithLLM(matrix, content, categoryKnowledge, llmCall, model) {
  // 选取 top 5 个影响最大的要点进行 LLM 增强
  const topPoints = matrix.slice(0, 5);

  const prompt = buildAttributionPrompt(topPoints, content, categoryKnowledge);

  try {
    const response = await llmCall(model, [
      { role: "system", content: "你是资深内容策略分析师，擅长内容-评论归因分析。输出严格的JSON格式。" },
      { role: "user", content: prompt }
    ]);

    // 解析 LLM 返回的增强洞察
    const parsed = typeof response === "string" ? JSON.parse(response) : response;
    return parsed.insights || [];
  } catch {
    // LLM 调用失败时使用规则生成的洞察
    return [];
  }
}

function buildAttributionPrompt(topPoints, content, categoryKnowledge) {
  const categoryName = categoryKnowledge?.categoryName || "未知品类";
  const pointsJson = topPoints.map(p => ({
    id: p.contentPointId,
    text: p.contentPointText,
    reactions: `${p.reactionCount}条评论 (${p.reactionType})`,
    negativeCount: p.sentimentDistribution.negative,
    positiveCount: p.sentimentDistribution.positive
  }));

  return `分析以下 ${categoryName} 品类内容的评论归因数据，为每个内容要点生成一段人类可读的归因洞察（50-100字）。

内容信息: ${JSON.stringify({ title: content.title, platform: content.platform })}
内容要点与评论反应: ${JSON.stringify(pointsJson)}

要求:
1. 每个洞察必须包含"为什么这个内容要点引发了这种反应"的因果推断
2. 引用具体的评论原文作为证据
3. 给出具体的下一条内容优化建议
4. 输出格式: { "insights": [{"contentPointId": "...", "insightText": "...", "nextAction": "..."}] }`;
}

function mergeWithFallback(matrix, llmInsights) {
  for (const item of matrix) {
    const enhanced = llmInsights.find(i => i.contentPointId === item.contentPointId);
    if (enhanced?.insightText) {
      item.insightText = enhanced.insightText;
    } else {
      // Fallback: 用规则生成基础洞察
      item.insightText = generateFallbackInsight(item);
    }
  }
  return matrix;
}

function generateFallbackInsight(item) {
  const reactionLabel = item.reactionType === "negative" ? "质疑" :
    item.reactionType === "positive" ? "正面共鸣" : "追问";
  const negCount = item.sentimentDistribution.negative;
  const posCount = item.sentimentDistribution.positive;
  const evidence = item.representativeComments?.[0]?.text?.slice(0, 50) || "用户评论";

  return `「${item.contentPointText?.slice(0, 30)}」引发了${item.reactionCount}条${reactionLabel}（正面${posCount}条/负面${negCount}条）。典型反应："${evidence}"。建议下一条内容针对此要点调整表达策略。`;
}

// ===== 附加输出 =====
function extractContentGaps(matrix, categoryKnowledge) {
  const gaps = [];

  // 识别缺少覆盖的需求维度
  const needs = categoryKnowledge?.needTaxonomy || [];
  const coveredNeeds = new Set(
    matrix.flatMap(m => m.demandSignals || []).map(d => d.demandCode)
  );

  for (const need of needs) {
    if (!coveredNeeds.has(need.code)) {
      gaps.push({
        gapTopic: need.label,
        gapDescription: need.description,
        relatedUserNeed: need.label,
        recommendedAction: `制作${need.label}相关的内容，覆盖用户未被满足的${need.label}需求`
      });
    }
  }

  return gaps;
}

function rankSellingPoints(matrix) {
  return matrix
    .filter(m => m.contentPointText && m.contentPointText.length > 5)
    .map(m => ({
      contentPointId: m.contentPointId,
      contentPointText: m.contentPointText,
      positiveResonance: m.sentimentDistribution.positive,
      negativeCriticism: m.sentimentDistribution.negative,
      impactScore: m.impactScore,
      verdict: m.impactScore >= 7 ? "high_potential" :
        m.impactScore >= 4 ? "needs_optimization" : "problematic"
    }));
}

function extractContentPointsFromLLM(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed.content_points || parsed.points || [];
  } catch {
    return [];
  }
}

function parseAttributionResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { matrix: [], gaps: [], rankings: [] };
  }
}

// 辅助：提取匹配模式的邻近句子
function extractRelevantSentence(body, pattern) {
  const sentences = body.split(/[。！？\n]+/);
  for (const s of sentences) {
    if (pattern.test(s) && s.length > 5) return s.trim().slice(0, 200);
  }
  return body.slice(0, 200);
}

// 构建管线中的 Agent 调用上下文
export function buildAttributionAgentContext(task, store) {
  const categoryKnowledge = store.list("categoryKnowledge");
  const activeCategory = categoryKnowledge[0] || null;

  return {
    taskId: task.id,
    content: {
      title: task.contentTitle || task.taskName || "",
      body: task.contentBody || "",
      platform: task.platform || "抖音",
      brandInfo: task.brandInfo || ""
    },
    categoryKnowledge: activeCategory,
    previousOutputs: {
      decomposition: task.decomposition || {},
      signals: task.commentSignals || {}
    }
  };
}
