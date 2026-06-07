// ============================================================
// 发布后复盘引擎 — 对比发布前后评论变化，形成数据闭环
// ============================================================

export function runPostPublishReview(input) {
  const { originalCard, publishedContent, newComments, originalAttribution } = input;

  // 1. 生产卡执行度评估
  const executionScore = evaluateExecution(originalCard, publishedContent);

  // 2. 评论区问题变化
  const barrierChanges = compareBarriers(originalAttribution, newComments);

  // 3. 内容效果判断
  const contentEffect = evaluateContentEffect(newComments, barrierChanges);

  // 4. 下一轮策略建议
  const nextRoundAdvice = generateNextRoundAdvice(executionScore, barrierChanges, contentEffect);

  return {
    executionScore,
    barrierChanges,
    contentEffect,
    nextRoundAdvice,
    summary: generateReviewSummary(executionScore, barrierChanges)
  };
}

function evaluateExecution(card, published) {
  const checks = [];
  let score = 100;

  // 检查脚本结构是否被执行
  if (card.script_structure && published.script_structure) {
    const usedSegments = card.script_structure.filter(s => 
      (published.script_structure || []).some(ps => ps.segment === s.segment)
    );
    const execRate = usedSegments.length / card.script_structure.length;
    score -= Math.round((1 - execRate) * 30);
    checks.push({ item: "生产卡执行度", value: `${Math.round(execRate * 100)}%`, score: Math.round(execRate * 100) });
  }

  // 检查证据是否被使用
  if (card.supporting_evidence && published.copywriting) {
    const usedEvidence = card.supporting_evidence.filter(e =>
      (published.copywriting || "").includes((typeof e === "string" ? e : "").slice(0, 10))
    );
    score -= (card.supporting_evidence.length - usedEvidence.length) * 5;
    checks.push({ item: "证据引用率", value: `${usedEvidence.length}/${card.supporting_evidence.length}`, score: Math.round(usedEvidence.length / card.supporting_evidence.length * 100) });
  }

  return {
    totalScore: Math.max(0, score),
    level: score >= 80 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "needs_improvement" : "poor",
    checks
  };
}

function compareBarriers(originalAttr, newComments) {
  const originalMatrix = originalAttr?.attributionMatrix || [];
  const originalBarriers = new Set(
    originalMatrix.flatMap(m => (m.barrierSignals || []).map(b => b.barrierLabel))
  );

  // 分析新评论中的障碍
  const newBarriers = new Set();
  const changes = [];
  for (const comment of (newComments || [])) {
    const text = (comment.commentText || comment.content || "").toLowerCase();
    if (/贵|价格|值不值/.test(text)) newBarriers.add("价格异议");
    if (/效果|没用|没用过/.test(text)) newBarriers.add("效果怀疑");
    if (/安全|过敏|刺激/.test(text)) newBarriers.add("安全担忧");
    if (/怎么用|步骤/.test(text)) newBarriers.add("使用不清");
  }

  // 计算变化
  for (const b of originalBarriers) {
    const resolved = !newBarriers.has(b);
    changes.push({ barrier: b, change: resolved ? "improved" : "persistent", status: resolved ? "🟢 缓解" : "🟡 持续" });
  }
  for (const b of newBarriers) {
    if (!originalBarriers.has(b)) {
      changes.push({ barrier: b, change: "new", status: "🔴 新增" });
    }
  }

  return changes;
}

function evaluateContentEffect(newComments, barrierChanges) {
  const total = newComments?.length || 0;
  const positiveCount = newComments?.filter(c =>
    /好|推荐|回购|买了|种草|不错/.test(c.commentText || c.content || "")
  ).length || 0;

  const improvedCount = barrierChanges.filter(b => b.change === "improved").length;
  const newIssueCount = barrierChanges.filter(b => b.change === "new").length;

  return {
    totalNewComments: total,
    positiveRatio: total > 0 ? Math.round(positiveCount / total * 100) : 0,
    barriersImproved: improvedCount,
    newBarriers: newIssueCount,
    verdict: newIssueCount === 0 && improvedCount > 0 ? "content_wins" :
      improvedCount > 0 ? "partially_improved" : "no_improvement"
  };
}

function generateNextRoundAdvice(execution, barriers, effect) {
  const advice = [];

  if (execution.totalScore < 60) {
    advice.push("生产卡执行度偏低，建议在拍摄时对照生产卡的分镜要求逐段录制");
  }

  const persistent = barriers.filter(b => b.change === "persistent");
  if (persistent.length > 0) {
    advice.push(`持续存在的障碍：${persistent.map(b => b.barrier).join("、")}，建议调整内容策略、改变表达角度`);
  }

  const newOnes = barriers.filter(b => b.change === "new");
  if (newOnes.length > 0) {
    advice.push(`新出现的障碍：${newOnes.map(b => b.barrier).join("、")}，可能由当前内容表达方式引发，下条内容优先覆盖`);
  }

  if (effect.verdict === "content_wins") {
    advice.push("本轮内容策略有效，建议继续复制成功模式并扩大投放");
  }

  return advice;
}

function generateReviewSummary(execution, barriers) {
  const improved = barriers.filter(b => b.change === "improved").length;
  const total = barriers.length;
  return `生产卡执行度 ${execution.totalScore} 分 (${execution.level})，${total} 个障碍中 ${improved} 个得到缓解，${barriers.filter(b => b.change === "persistent").length} 个持续存在`;
}
