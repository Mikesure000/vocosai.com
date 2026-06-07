// ============================================================
// 评论区运营引擎 — 置顶建议/回复话术/负面评论处理/私信模板
// ============================================================

export function generateCommentOps(input) {
  const { attribution, categoryKnowledge, platform } = input;
  const barriers = extractKeyBarriers(attribution);

  return {
    suggestedPinnedComments: generatePinnedComments(barriers, platform),
    standardReplies: generateStandardReplies(barriers, categoryKnowledge),
    negativeHandling: generateNegativeHandling(barriers),
    secondaryQuestions: generateSecondaryQuestions(barriers),
    privateMessageScripts: generatePrivateScripts(barriers),
    nextContentGuide: generateNextGuide(barriers, platform)
  };
}

function extractKeyBarriers(attribution) {
  const matrix = attribution?.attributionMatrix || attribution?.result || [];
  const all = [];
  for (const item of matrix) {
    const barriers = item.barrierSignals || [];
    all.push(...barriers.map(b => ({ ...b, reactionType: item.reactionType, evidence: item.representativeComments?.[0]?.text })));
  }
  return all.slice(0, 5);
}

function generatePinnedComments(barriers, platform) {
  const primary = barriers[0]?.barrierLabel || "效果";
  const prefix = platform === "douyin" ? "🎵 " : "📕 ";

  return [
    `${prefix}很多人在问${primary}的问题，这条置顶专门解答——评论区打"想知道"的我优先回复`,
    `评论区呼声最高的${barriers.length}个问题，下条内容我们会逐个拆解，先收藏不迷路`,
    `关于${barriers.map(b => b.barrierLabel).join("/")}，已经回复在评论区了，点开看答案`
  ];
}

function generateStandardReplies(barriers, categoryKnowledge) {
  const replies = [];

  for (const b of barriers.slice(0, 3)) {
    const label = b.barrierLabel || "常见问题";
    if (b.reactionType === "negative") {
      replies.push({
        scenario: `${label}异议`,
        reply: `你的顾虑很合理~关于${label}，主要看这几点：1.成分/技术角度... 2.适用人群角度... 3.使用场景角度... 具体看下条内容详细拆解`,
        tone: "专业+共情"
      });
    } else {
      replies.push({
        scenario: `关于${label}的提问`,
        reply: `好问题！${label}在${categoryKnowledge?.categoryName || "这个品类"}里确实是最多用户关心的。简单说就是...（展开说核心点），更深度的分析下条内容见~`,
        tone: "专家+引导"
      });
    }
  }

  return replies;
}

function generateNegativeHandling(barriers) {
  const negativeOnes = barriers.filter(b => b.reactionType === "negative");
  if (negativeOnes.length === 0) return [];

  return negativeOnes.map(b => ({
    issue: b.barrierLabel,
    response: `感谢你的反馈，你的意见对我们非常重要。关于${b.barrierLabel}的问题，我们在认真考虑优化方案。`,
    escalation: b.barrierLabel.includes("安全") || b.barrierLabel.includes("过敏"),
    action: b.barrierLabel.includes("价格") ? "补充价值解释内容" :
            b.barrierLabel.includes("效果") ? "发布真实使用案例" : "持续跟进用户反馈"
  }));
}

function generateSecondaryQuestions(barriers) {
  return [
    `你觉得${barriers[0]?.barrierLabel || "这个问题"}最大的顾虑是什么？`,
    `用过的朋友来分享一下使用感受？`,
    `最想先看哪个维度的对比？成分/体验/价格？`,
    `护肤流程里你会在哪一步用它？`
  ];
}

function generatePrivateScripts(barriers) {
  return [
    { scenario: "用户咨询购买", script: `感谢你的关注！关于${barriers[0]?.barrierLabel || "产品"}，建议先通过我们的内容了解关键信息，再决定是否适合你~` },
    { scenario: "用户要求优惠", script: "感谢支持！现在能看到的就是我们最实惠的方案了，值不值得入看了我们的内容再决定~" },
  ];
}

function generateNextGuide(barriers, platform) {
  const topics = barriers.map(b => b.barrierLabel).join(" · ");
  return `${platform === "douyin" ? "下条视频" : "下篇笔记"}预告：${topics}，评论区告诉我你最想看哪个`;
}
