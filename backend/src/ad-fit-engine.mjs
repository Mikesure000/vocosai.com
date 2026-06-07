// ============================================================
// 投流适配评分引擎 — 9维度评估内容投流可行性
// ============================================================

const DIMENSION_WEIGHTS = {
  audience_clarity: 15,    // 人群清晰度
  selling_point_clarity: 15, // 卖点清晰度
  purchase_reason: 15,     // 购买理由
  comment_risk: 15,        // 评论风险
  compliance_risk: 10,     // 合规风险
  asset_stability: 10,     // 素材稳定性
  reusability: 10,         // 可复用性
  conversion_readiness: 5, // 转化承接
  platform_fit: 5,         // 平台适配
};

export function scoreAdFit(productionCard, attribution) {
  const scores = {};
  const warnings = [];
  const suggestions = [];

  // 1. 人群清晰度 (15)
  const audience = productionCard.target_audience_pain_point || "";
  scores.audience_clarity = audience.length > 15 ? 13 : audience.length > 5 ? 10 : 5;

  // 2. 卖点清晰度 (15)
  const sellingPoints = productionCard.selling_points || [];
  scores.selling_point_clarity = Math.min(15, sellingPoints.length * 5);

  // 3. 购买理由 (15)
  const hasEvidence = (productionCard.supporting_evidence || []).length >= 2;
  scores.purchase_reason = hasEvidence ? 13 : sellingPoints.length > 0 ? 8 : 4;

  // 4. 评论风险 (15)
  const matrix = attribution?.attributionMatrix || [];
  const negativeRatio = matrix.filter(m => m.reactionType === "negative").length / Math.max(1, matrix.length);
  scores.comment_risk = negativeRatio > 0.5 ? 5 : negativeRatio > 0.3 ? 8 : 12;
  if (negativeRatio > 0.3) warnings.push(`评论区负面占比${Math.round(negativeRatio * 100)}%，建议先优化内容再投流`);

  // 5. 合规风险 (10)
  const qc = productionCard.quality_check_result || {};
  scores.compliance_risk = qc.totalScore >= 80 ? 9 : qc.totalScore >= 60 ? 6 : 3;
  if (qc.totalScore < 80) warnings.push(`质检评分${qc.totalScore}分，需修改后投流`);

  // 6. 素材稳定性 (10)
  scores.asset_stability = productionCard.ab_test_variables?.length >= 2 ? 8 : 5;

  // 7. 可复用性 (10)
  const scriptLen = (productionCard.script_structure || []).length;
  scores.reusability = scriptLen >= 4 ? 8 : 5;

  // 8. 转化承接 (5)
  const copy = productionCard.copywriting || "";
  scores.conversion_readiness = /购买|下单|链接|咨询|私信/.test(copy) ? 4 : 2;

  // 9. 平台适配 (5)
  scores.platform_fit = productionCard.card_type ? 4 : 2;

  // 加权总分
  const totalScore = Math.round(
    Object.entries(scores).reduce((sum, [dim, score]) => sum + score * (DIMENSION_WEIGHTS[dim] || 0) / 100, 0)
  );

  const verdict = totalScore >= 75 ? "recommend_broad" :
    totalScore >= 60 ? "recommend_test" :
    totalScore >= 45 ? "needs_optimization" : "not_recommended";

  const verdictLabels = {
    recommend_broad: "适合放量投流",
    recommend_test: "适合小预算测试",
    needs_optimization: "建议优化后投流",
    not_recommended: "不建议投流"
  };

  // 测试变量建议
  const abHints = [];
  if (scores.audience_clarity < 10) abHints.push({ variable: "人群定向", variantA: "泛人群", variantB: "精准人群" });
  if (scores.comment_risk < 10) abHints.push({ variable: "开头类型", variantA: "评论质疑型", variantB: "效果证明型" });

  return {
    totalScore,
    verdict,
    verdictLabel: verdictLabels[verdict],
    dimensionScores: scores,
    warnings,
    abTestHints: abHints,
    recommendation: verdict === "recommend_broad"
      ? "该内容投流条件良好，建议直接放量测试，同时监控评论区反馈"
      : verdict === "recommend_test"
      ? "建议先小预算(500-2000元)测试素材表现，根据数据调整后放量"
      : verdict === "needs_optimization"
      ? suggestions.join("; ")
      : "该内容不建议投流，需重新优化脚本结构和卖点表达"
  };
}
