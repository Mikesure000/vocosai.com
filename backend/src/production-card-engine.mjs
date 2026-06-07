// ============================================================
// 内容生产卡引擎 — 将归因洞察转化为可执行的内容脚本
// ============================================================

import { getAgentByCode } from "./agents.mjs";

/**
 * 生产卡生成 — 基于归因结果 + 平台方法论，生成 douyin/xiaohongshu 差异化生产卡
 *
 * 核心21字段:
 *   card_type, title, target_audience_pain_point, hook_strategy,
 *   script_structure, copywriting, asset_specs, supporting_evidence,
 *   selling_points, objection_handling, expected_outcome,
 *   ab_test_variables, quality_check_result, agent_run_id, status
 */
export async function generateProductionCard(input) {
  const { attribution, categoryKnowledge, content, platform, llmCall } = input;
  const agent = getAgentByCode("production_card_agent");
  const model = agent?.defaultModel || "deepseek-v4-pro";

  const tactics = categoryKnowledge?.platformTactics?.[platform] || {};
  const topBarriers = extractBarriers(attribution);
  const topDemands = extractDemands(attribution);
  const evidence = collectEvidence(attribution);

  // 生成抖音/小红书差异化内容
  const card = platform === "xiaohongshu" 
    ? buildXiaohongshuCard(content, topBarriers, topDemands, evidence, tactics, categoryKnowledge)
    : buildDouyinCard(content, topBarriers, topDemands, evidence, tactics, categoryKnowledge);

  // LLM 增强标题和文案
  try {
    const enhanced = await enhanceWithLLM(card, content, attribution, model, llmCall);
    Object.assign(card, enhanced);
  } catch {} // LLM 失败时使用规则生成的内容

  return card;
}

// ===== 抖音生产卡 =====
function buildDouyinCard(content, barriers, demands, evidence, tactics, categoryKnowledge) {
  const primaryBarrier = barriers[0]?.label || "效果怀疑";
  const primaryDemand = demands[0]?.label || "性价比";

  const hookStrategies = tactics?.hookStrategies || ["评论质疑开头", "实测验效过程"];
  const hook = hookStrategies[0] || "评论质疑开头";

  return {
    card_type: "douyin",
    title: `${content.title || "内容"} · 评论区呼声最高的问题`,
    target_audience_pain_point: `用户最关心: ${primaryBarrier} — "${evidence[0]?.text?.slice(0, 30) || "效果到底怎么样"}"`,
    hook_strategy: `${hook}型开头 — 直接引用评论区最高频疑问`,
    script_structure: [
      { segment: "前3秒钩子", duration: "3-5s", content: `"评论区都在问：${primaryBarrier}？"`, visual: "评论截图叠加+大字标题" },
      { segment: "承认质疑", duration: "5-8s", content: "先承认用户的疑问是合理的", visual: "口播+屏幕文案" },
      { segment: "价值拆解", duration: "20-30s", content: `从3个角度拆解: 成分/技术/体验`, visual: "产品特写+数据可视化" },
      { segment: "证据展示", duration: "10-15s", content: evidence.slice(0, 2).map(e => `用户反馈: "${e.text?.slice(0, 20)}"`).join("。"), visual: "用户反馈截图叠层" },
      { segment: "CTA引导", duration: "3-5s", content: "如果你也在纠结这个问题，评论区告诉我，下条内容专门聊", visual: "口播+评论区截图" }
    ],
    copywriting: buildDouyinScript(content, primaryBarrier, evidence),
    asset_specs: { type: "短视频口播", duration: "30-90s", format: "9:16竖屏", visuals: ["评论截图", "产品特写", "用户反馈截图"] },
    supporting_evidence: evidence.slice(0, 3).map(e => e.text),
    selling_points: demands.slice(0, 3).map(d => enrichSellingPoint(d, evidence, categoryKnowledge)),
    objection_handling: barriers.slice(0, 3).map(b => ({ objection: b.barrierLabel || b.label, response: `${b.barrierLabel || b.label}是品类常见问题，下条内容重点拆解` })),
    expected_outcome: `降低${primaryBarrier}相关疑问50%，提升购买意图信号30%`,
    ab_test_variables: [
      { variable: "开头钩子", variantA: "评论质疑型", variantB: "效果证明型" }
    ]
  };
}

function buildDouyinScript(content, primaryBarrier, evidence) {
  return `【开头】"评论区都在问一个共同的问题：${primaryBarrier}？"\n\n【承认】"这个疑问非常合理。作为一个老用户/专业团队，我最初也有过同样的疑问。"\n\n【拆解】从三个角度来讲清楚：第一，成分/技术原理...第二，真实使用体验...第三，和竞品的核心差异...\n\n【证据】"你看这条评论说得就很实在：'${evidence[0]?.text?.slice(0, 30)}...'"\n\n【引导】"如果你也有类似疑问，评论区告诉我，下一条专门拍你的问题"`;
}

// ===== 小红书生产卡 =====
function buildXiaohongshuCard(content, barriers, demands, evidence, tactics, categoryKnowledge) {
  const primaryBarrier = barriers[0]?.label || "效果怀疑";
  const hookStrategies = tactics?.hookStrategies || ["成分科普", "测评清单"];

  const keywords = ["成分", primaryBarrier, "真实测评", content.brandInfo || "护肤"].filter(Boolean).slice(0, 5);

  return {
    card_type: "xiaohongshu",
    title: `${primaryBarrier}？亲测告诉你答案（附成分对比）`,
    target_audience_pain_point: `评论区高频问题: ${primaryBarrier} — ${evidence[0]?.text?.slice(0, 30) || "用户最关心的点"}`,
    hook_strategy: `${hookStrategies[0] || "成分科普"}型笔记 — 用专业内容建立信任`,
    script_structure: [
      { segment: "标题", duration: "首屏", content: `${primaryBarrier}？4个维度一次讲清楚` },
      { segment: "结论先行", duration: "开头段", content: "先说结论：值不值/好不好/适不适合，取决于..." },
      { segment: "维度拆解", duration: "正文主体", content: "维度1: 成分/技术 | 维度2: 使用体验 | 维度3: 适用人群 | 维度4: 竞品对比" },
      { segment: "人群清单", duration: "结尾段", content: "适合/不适合人群清单 + 避坑提醒" },
      { segment: "互动引导", duration: "末尾", content: "评论区告诉我下一个想看什么对比" }
    ],
    copywriting: buildXiaohongshuCopy(content, primaryBarrier, keywords, evidence),
    asset_specs: { type: "图文笔记", imageCount: "6-9张", images: ["成分表截图", "使用前后对比", "竞品参数对比表", "用户反馈精选"] },
    supporting_evidence: evidence.slice(0, 3).map(e => e.text),
    selling_points: demands.slice(0, 3).map(d => enrichSellingPoint(d, evidence, categoryKnowledge)),
    objection_handling: barriers.slice(0, 3).map(b => ({ objection: b.barrierLabel || b.label, response: `已在'人群清单'部分标明适合/不适合情况` })),
    expected_outcome: `收藏率提升50%，评论区追问减少30%`,
    ab_test_variables: [
      { variable: "标题风格", variantA: "疑问式", variantB: "结论式" },
      { variable: "关键词密度", variantA: "3个", variantB: "5个" }
    ]
  };
}

function buildXiaohongshuCopy(content, primaryBarrier, keywords, evidence) {
  const keywordLine = `关键词: ${keywords.join(" · ")}`;

  return `【标题】${primaryBarrier}？4个维度一次讲清楚\n\n${keywordLine}\n\n【先说结论】值不值/好不好/适不适合，答案不是一刀切的。我拆成4个维度，你对照自己的情况看。\n\n【正文】\n\n一、成分/技术维度\n核心技术是什么？和平替的差距在哪里？\n\n二、使用体验维度\n质地/吸收/肤感/香味。最重要的是——会不会搓泥。\n\n三、适用人群\n✔ 适合：肤质敏感、预算中等、追求性价比\n✖ 不适合：追求奢侈体验、已有稳定routine、皮肤状态良好\n\n四、竞品对照\n和XX比：成分浓度更高 | 和YY比：价格更友好 | 和ZZ比：针对人群不同\n\n【评论互动】你用过吗？评论区说说你的感受，或者告诉我下一个想看什么对比——我会认真考虑！`;
}

// ===== 辅助函数 =====

function extractDemands(attribution) {
  const matrix = attribution?.attributionMatrix || attribution?.result || [];
  const seen = new Set();
  const demandSignals = [];
  for (const item of matrix) {
    if (item.demandSignals) {
      for (const d of item.demandSignals) {
        const key = d.demandLabel || d.label || d.demandCode;
        if (!seen.has(key)) { seen.add(key); demandSignals.push(d); }
      }
    }
  }
  return demandSignals.slice(0, 5);
}
function extractBarriers(attribution) {
  const matrix = attribution?.attributionMatrix || attribution?.result || [];
  const seen = new Set();
  const barrierSignals = [];
  for (const item of matrix) {
    if (item.barrierSignals) {
      for (const b of item.barrierSignals) {
        const key = b.barrierLabel || b.label || b.barrierCode;
        if (!seen.has(key)) { seen.add(key); barrierSignals.push(b); }
      }
    }
  }
  return barrierSignals.slice(0, 5);
}

function collectEvidence(attribution) {
  const matrix = attribution?.attributionMatrix || attribution?.result || [];
  const comments = [];
  for (const item of matrix) {
    if (item.representativeComments) {
      comments.push(...item.representativeComments.map(c => ({
        text: c.text,
        likeCount: c.likeCount || 0,
        reaction: item.reactionType
      })));
    }
  }
  // 按点赞数排序，取 top 5
  return comments.sort((a, b) => b.likeCount - a.likeCount).slice(0, 5);
}

// LLM 增强标题和文案
async function enhanceWithLLM(card, content, attribution, model, llmCall) {
  const prompt = buildEnhancePrompt(card, content, attribution);
  const response = await llmCall(model, [
    { role: "system", content: "你是资深内容策划，擅长短视频和小红书文案优化。输出JSON。保持品牌调性。每段文案50-100字。" },
    { role: "user", content: prompt }
  ]);

  const parsed = typeof response === "string" ? JSON.parse(response) : response;
  return {
    title: parsed.title || card.title,
    copywriting_enhanced: parsed.copywriting || null,
    hook_variants: parsed.hook_variants || []
  };
}

function buildEnhancePrompt(card, content, attribution) {
  return `优化以下 ${card.card_type === "douyin" ? "抖音" : "小红书"} 内容生产卡的标题和文案，使其更有"人感"——像真人创作者的口吻，而非AI生成。

原始标题: ${card.title}
平台: ${card.card_type}
品类: ${content.brandInfo || "美妆护肤"}

归因要点:
${JSON.stringify(attribution?.attributionMatrix?.slice(0, 3) || [])}

输出JSON:
{
  "title": "优化后的标题（12-25字）",
  "copywriting": "优化后的核心口播/正文（80-150字）",
  "hook_variants": ["钩子变体1", "钩子变体2"]
}`;
}

// 优化卖点：从品类知识库提取完整描述，确保≥10字 + 匹配最佳证据
function enrichSellingPoint(demand, evidence, categoryKnowledge) {
  const label = demand.demandLabel || demand.label || demand.demandCode || "未知需求";
  const needTaxonomy = categoryKnowledge?.needTaxonomy || [];
  const needInfo = needTaxonomy.find(n => n.code === demand.demandCode || n.label === label);

  // 从品类知识库提取完整描述
  const fullPoint = needInfo 
    ? `${needInfo.label}：${needInfo.description.slice(0, 30)}`
    : `${label}相关需求`;

  // 从证据中找到最匹配的评论
  let bestEvidence = "评论区反馈";
  if (evidence && evidence.length > 0) {
    const match = evidence.find(e => {
      const t = (e.text || '').toLowerCase();
      return t.includes(label.slice(0, 2).toLowerCase()) ||
        (needInfo?.description || '').split('').some(c => t.includes(c));
    });
    bestEvidence = match ? match.text.slice(0, 20) : evidence[0]?.text?.slice(0, 20) || "评论区反馈";
  }

  return { point: fullPoint, evidence: bestEvidence };
}
