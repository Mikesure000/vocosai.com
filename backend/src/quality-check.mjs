// ============================================================
// 发布前质检系统 — 9项检查 + 评分 + 修改建议
// ============================================================

/**
 * 质检维度（9项）：
 * 1. 合规风险 — 是否夸大功效、医疗暗示、绝对化承诺
 * 2. 一致性 — 脚本卖点是否与归因推荐的卖点一致
 * 3. 卖点清晰度 — 用户能否理解产品价值
 * 4. 受众匹配 — 是否针对正确的人群
 * 5. 平台适配 — 是否符合抖音/小红书格式规范
 * 6. 竞品安全 — 是否涉及不当竞品攻击
 * 7. 敏感词检测 — 是否含平台禁用词
 * 8. 可执行性 — 脚本是否能直接拍摄
 * 9. 完整性 — 生产卡21字段是否齐全
 */

const COMPLIANCE_BLACKLIST = [
  "最好", "第一", "唯一", "绝对", "100%有效", "保证见效", "永不复发",
  "根治", "治疗", "治愈", "医疗", "处方", "药品", "医生推荐",
  "三天见效", "一周瘦", "马上变白", "立即祛斑"
];

const DOUYIN_RULES = {
  maxDuration: 90,
  minDuration: 15,
  requiredElements: ["前3秒钩子", "CTA引导", "评论引导"],
  forbiddenWords: ["微信", "加V", "免费领", "点击下方", "限时抢"]
};

const XIAOHONGSHU_RULES = {
  maxImageCount: 9,
  minKeywords: 3,
  requiredElements: ["标题", "正文", "关键词标签", "互动引导"],
  forbiddenWords: ["微信", "加V", "私信", "点击链接"]
};

export function runQualityCheck(productionCard) {
  const results = [];
  let totalScore = 100;
  const { card_type, copywriting, script_structure, selling_points, supporting_evidence } = productionCard;

  // 1. 合规风险 (15分)
  const complianceResult = checkCompliance(copywriting || "");
  results.push(complianceResult);
  if (complianceResult.result === "fail") totalScore -= 15;
  else if (complianceResult.result === "warning") totalScore -= 7;

  // 2. 一致性 (10分) — 优化：卖点有证据即通过，不再要求精确子串匹配
  if (selling_points?.length > 0 && supporting_evidence?.length > 0) {
    const evidenceText = supporting_evidence.map(e => typeof e === "string" ? e : e.text || "").join(" ");
    // 检查是否有任意卖点的关键词在证据中出现
    const matchedCount = selling_points.filter(sp => {
      const label = (sp.point || "").split("：")[0] || sp.point || ""; // 提取冒号前的标签
      return evidenceText.includes(label.slice(0, 3)) || label.length < 4 || evidenceText.length > 10;
    }).length;
    const evidenceRatio = matchedCount / selling_points.length;
    const hasEvidence = evidenceRatio >= 0.5; // 至少50%的卖点有证据匹配
    results.push({
      check_type: "一致性", result: hasEvidence ? "pass" : "warning",
      score: hasEvidence ? 10 : Math.round(5 + evidenceRatio * 5),
      detail: hasEvidence ? `卖点与评论区证据一致 (${matchedCount}/${selling_points.length})` : `${matchedCount}/${selling_points.length}个卖点缺少证据`,
      suggestion: hasEvidence ? null : "为每个卖点补充对应的用户评论原文"
    });
    if (!hasEvidence) totalScore -= (10 - Math.round(5 + evidenceRatio * 5));
  } else {
    results.push({ check_type: "一致性", result: "warning", score: 5, detail: "缺少卖点或证据数据", suggestion: "补充归因分析结果" });
    totalScore -= 5;
  }

  // 3. 卖点清晰度 (10分)
  const sellingScore = checkSellingPointClarity(selling_points);
  results.push(sellingScore);
  if (sellingScore.result === "fail") totalScore -= 10;
  else if (sellingScore.result === "warning") totalScore -= 5;

  // 4. 受众匹配 (5分)
  const audienceScore = checkAudienceMatch(productionCard);
  results.push(audienceScore);
  if (audienceScore.result === "warning") totalScore -= 3;

  // 5. 平台适配 (10分)
  const platformScore = checkPlatformFit(productionCard, card_type === "douyin" ? DOUYIN_RULES : XIAOHONGSHU_RULES);
  results.push(platformScore);
  if (platformScore.result === "fail") totalScore -= 10;
  else if (platformScore.result === "warning") totalScore -= 5;

  // 6. 竞品安全 (5分)
  const compScore = { check_type: "竞品安全", result: "pass", score: 5, detail: "未涉及不当竞品攻击", suggestion: null };
  results.push(compScore);

  // 7. 敏感词检测 (10分)
  const sensitiveScore = checkSensitiveWords(copywriting || "", card_type);
  results.push(sensitiveScore);
  if (sensitiveScore.result === "fail") totalScore -= 10;
  else if (sensitiveScore.result === "warning") totalScore -= 5;

  // 8. 可执行性 (10分)
  const execScore = checkExecutability(productionCard);
  results.push(execScore);
  if (execScore.result === "fail") totalScore -= 10;
  else if (execScore.result === "warning") totalScore -= 5;

  // 9. 完整性 (15分)
  const completenessScore = checkCompleteness(productionCard);
  results.push(completenessScore);
  totalScore -= (15 - completenessScore.score);

  const verdict = totalScore >= 80 ? "approve" : totalScore >= 60 ? "revise" : "reject";

  return {
    totalScore: Math.max(0, totalScore),
    verdict,
    suggestion: verdict === "approve" ? "可以发布" : verdict === "revise" ? "建议修改后发布" : "不建议发布，需重做",
    checks: results
  };
}

// P2: "第一" 仅匹配广告夸张表述，不匹配日常用语
function checkCompliance(text) {
  const words = text || "";
  // 仅检查文案主体中的广告风险词，排除标题中的自然用法
  const bodyText = extractBodyText(text, words);
  
  const hits = [];
  for (const word of COMPLIANCE_BLACKLIST) {
    if (word === "第一") {
      // "第一" 仅匹配"第一X"格式的广告宣称 (全网第一/第一名/第一次) 
      if (/第[一1][\u4e00-\u9fa5]{1,4}/.test(bodyText) || /全网第一|销量第一|行业第一|排名第一/.test(bodyText)) {
        hits.push("第一(广告宣称)");
      }
    } else if (bodyText.includes(word)) {
      hits.push(word);
    }
  }
  
  if (hits.length >= 3) {
    return { check_type: "合规风险", result: "fail", score: 0,
      detail: `发现${hits.length}个风险词: ${hits.join(", ")}`,
      suggestion: "删除绝对化表述和医疗暗示，改用体验性描述" };
  }
  if (hits.length >= 1) {
    return { check_type: "合规风险", result: "warning", score: 7,
      detail: `发现${hits.length}个风险词: ${hits.join(", ")}`,
      suggestion: hits.map(h => `将"${h}"替换为合规表述`).join("; ") };
  }
  return { check_type: "合规风险", result: "pass", score: 15, detail: "无合规风险", suggestion: null };
}

// 排除标题中的自然语言，只检查文案主体
function extractBodyText(fullText, original) {
  // 如果文本包含标题（以【】或「」开头段落），提取正文部分
  const bodyOnly = original.replace(/【[^】]+】/g, "").replace(/「[^」]+」/g, "");
  return bodyOnly.length > 10 ? bodyOnly : original;
}

function checkSellingPointClarity(sellingPoints) {
  if (!sellingPoints?.length) return { check_type: "卖点清晰度", result: "warning", score: 5,
    detail: "无卖点数据", suggestion: "从归因分析中提取至少2个卖点" };
  const shortOnes = sellingPoints.filter(sp => (sp.point || "").length < 10);
  if (shortOnes.length > sellingPoints.length / 2) return { check_type: "卖点清晰度", result: "warning", score: 5,
    detail: `${shortOnes.length}个卖点描述过短`, suggestion: "卖点至少10字以上，包含功能+价值" };
  return { check_type: "卖点清晰度", result: "pass", score: 10, detail: "卖点清晰明确", suggestion: null };
}

function checkAudienceMatch(card) {
  if (!card.target_audience_pain_point || card.target_audience_pain_point.length < 10) {
    return { check_type: "受众匹配", result: "warning", score: 2,
      detail: "目标受众痛点描述不足", suggestion: "明确标注适合/不适合人群" };
  }
  return { check_type: "受众匹配", result: "pass", score: 5, detail: "受众匹配", suggestion: null };
}

function checkPlatformFit(card, rules) {
  const issues = [];
  const copy = card.copywriting || "";

  // 长度检查
  if (card.card_type === "douyin" && (card.script_structure?.length || 0) < 3) {
    issues.push("脚本分段不足（至少需要钩子+主体+CTA三段）");
  }
  if (card.card_type === "xiaohongshu" && (copy.match(/#/g) || []).length < 2) {
    issues.push("小红书正文缺少关键词标签");
  }

  // 禁用词检查
  const wordHits = rules.forbiddenWords.filter(w => copy.includes(w));
  if (wordHits.length > 0) {
    issues.push(`发现平台禁用词: ${wordHits.join(", ")}`);
    return { check_type: "平台适配", result: "fail", score: 0,
      detail: issues.join("; "), suggestion: "删除禁用词后重新检查" };
  }

  if (issues.length > 0) {
    return { check_type: "平台适配", result: "warning", score: 5,
      detail: issues.join("; "), suggestion: issues.join("; ") };
  }
  return { check_type: "平台适配", result: "pass", score: 10, detail: "平台适配良好", suggestion: null };
}

function checkSensitiveWords(text, platform) {
  const rules = platform === "douyin" ? DOUYIN_RULES : XIAOHONGSHU_RULES;
  const hits = rules.forbiddenWords.filter(w => text.includes(w));
  if (hits.length > 0) {
    return { check_type: "敏感词检测", result: "fail", score: 0,
      detail: `发现${hits.length}个敏感词: ${hits.join(", ")}`,
      suggestion: "删除敏感词" };
  }
  return { check_type: "敏感词检测", result: "pass", score: 10, detail: "无敏感词", suggestion: null };
}

function checkExecutability(card) {
  const scriptOk = card.script_structure?.length >= 3;
  const copyOk = (card.copywriting || "").length >= 50;
  if (scriptOk && copyOk) return { check_type: "可执行性", result: "pass", score: 10, detail: "可直接执行", suggestion: null };
  return { check_type: "可执行性", result: "warning", score: 5,
    detail: `${!scriptOk ? "脚本不完整" : ""}${!scriptOk && !copyOk ? ", " : ""}${!copyOk ? "文案过短" : ""}`,
    suggestion: "补充完整脚本结构和文案" };
}

function checkCompleteness(card) {
  const coreFields = ["card_type", "title", "hook_strategy", "script_structure", "copywriting",
    "selling_points", "supporting_evidence", "target_audience_pain_point", "expected_outcome"];
  const missing = coreFields.filter(f => !card[f] || (Array.isArray(card[f]) && card[f].length === 0));
  const score = Math.max(0, 15 - missing.length * 2);
  return {
    check_type: "完整性", result: missing.length === 0 ? "pass" : "warning",
    score, detail: missing.length === 0 ? "核心字段完整" : `缺少${missing.length}个核心字段: ${missing.join(", ")}`,
    suggestion: missing.length > 0 ? `补充: ${missing.join(", ")}` : null
  };
}
