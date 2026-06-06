export const COMMENT_SIGNAL_TAXONOMY = [
  {
    key: "purchase_intent",
    label: "购买意图",
    description: "用户表达想买、愿意下单、求链接、试试等转化动作。",
    keywords: ["下单", "想买", "买一个", "入手", "链接", "试试", "安排", "冲了", "想要"]
  },
  {
    key: "price_objection",
    label: "价格异议",
    description: "用户关注贵不贵、值不值、平替、价格门槛。",
    keywords: ["贵", "价格", "多少钱", "平替", "划算", "值不值", "便宜"]
  },
  {
    key: "effect_skepticism",
    label: "效果怀疑",
    description: "用户怀疑效果、见效时间、是否真的有用。",
    keywords: ["真的", "有效", "效果", "多久", "明显", "有用", "能消", "能改善", "黑眼圈"]
  },
  {
    key: "safety_concern",
    label: "安全担忧",
    description: "用户担心刺激、过敏、敏感肌、眼周安全。",
    keywords: ["敏感", "刺激", "过敏", "安全", "发红", "刺痛", "孕妇", "哺乳"]
  },
  {
    key: "usage_question",
    label: "使用疑问",
    description: "用户询问用法、频次、搭配、步骤、多久敷。",
    keywords: ["怎么用", "用法", "几次", "多久", "搭配", "步骤", "敷", "每天"]
  },
  {
    key: "audience_fit",
    label: "人群适配",
    description: "用户问自己这种状态、人群、年龄、肤质是否适合。",
    keywords: ["适合", "可以用", "能用", "重度", "熬夜", "学生", "妈妈", "油皮", "干皮"]
  },
  {
    key: "competitor_comparison",
    label: "竞品比较",
    description: "用户拿竞品、平替、同类眼膜或医美方案对比。",
    keywords: ["对比", "平替", "同款", "其他眼膜", "医美", "眼霜", "和别的"]
  },
  {
    key: "negative_experience",
    label: "负面体验",
    description: "用户反馈无效、踩雷、不舒服、差评。",
    keywords: ["没用", "无效", "踩雷", "不好", "难用", "刺痛", "翻车", "智商税"]
  },
  {
    key: "repurchase_signal",
    label: "复购信号",
    description: "用户表达回购、一直用、囤货、推荐。",
    keywords: ["回购", "一直用", "囤", "推荐", "用了", "空瓶"]
  },
  {
    key: "dm_consult_signal",
    label: "私信咨询信号",
    description: "用户要求私信、链接、购买入口或一对一咨询。",
    keywords: ["私信", "发我", "链接", "怎么买", "哪里买", "求入口"]
  },
  {
    key: "scenario_need",
    label: "场景需求",
    description: "用户提到熬夜、约会、上镜、节日、急救等场景。",
    keywords: ["熬夜", "急救", "上镜", "约会", "女神节", "通勤", "出差", "婚礼"]
  },
  {
    key: "ingredient_focus",
    label: "成分关注",
    description: "用户关注成分、科技、原理、透皮、微晶等机制。",
    keywords: ["成分", "原理", "微晶", "透皮", "黑科技", "科技", "仙人掌", "机制"]
  },
  {
    key: "trust_gap",
    label: "信任缺口",
    description: "用户需要真人验证、证据、前后对比、专业背书。",
    keywords: ["姐妹试过", "真实", "报告", "测评", "前后", "证据", "靠谱吗", "一头雾水"]
  }
];

const TAXONOMY_BY_KEY = new Map(COMMENT_SIGNAL_TAXONOMY.map((item) => [item.key, item]));

export function buildAgentContext({ store, task }) {
  const comments = store.list("comments").filter((comment) => comment.taskId === task.id);
  const commentInsights = buildCommentInsights({ comments });

  return {
    team_id: task.teamId,
    project_id: task.projectId,
    task_id: task.id,
    content_title: task.contentTitle,
    content_body: task.contentBody,
    content_goal: task.contentGoal,
    platform: task.platform,
    brand_info: task.brandInfo,
    product_info: task.productInfo,
    comment_count: comments.length,
    comment_insights: commentInsights,
    value_questions: [
      "这条内容为什么引发这些评论？",
      "用户真正卡在哪里？",
      "下一条内容怎么拍？",
      "脚本怎么写？",
      "评论区怎么运营？",
      "这条内容能不能投流？"
    ]
  };
}

export function buildCommentInsights({ comments }) {
  const classified = comments.map(classifyComment);
  const signals = COMMENT_SIGNAL_TAXONOMY.map((taxonomy) => {
    const matches = classified
      .filter((item) => item.signalKeys.includes(taxonomy.key))
      .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));

    return {
      key: taxonomy.key,
      label: taxonomy.label,
      description: taxonomy.description,
      count: matches.length,
      evidence: matches.slice(0, 5).map((item) => toEvidence(item, taxonomy.key))
    };
  }).filter((signal) => signal.count > 0)
    .sort((a, b) => b.count - a.count);

  const topComments = classified
    .filter((item) => item.commentText)
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
    .slice(0, 20)
    .map((item) => toEvidence(item));

  return {
    taxonomyVersion: "voc_signal_v0.2.0",
    totalComments: comments.length,
    classifiedComments: classified.filter((item) => item.signalKeys.length > 0).length,
    signalCoverage: comments.length === 0 ? 0 : Number((classified.filter((item) => item.signalKeys.length > 0).length / comments.length).toFixed(4)),
    signals,
    topBarriers: pickSignals(signals, ["effect_skepticism", "price_objection", "safety_concern", "trust_gap", "audience_fit"]),
    conversionSignals: pickSignals(signals, ["purchase_intent", "dm_consult_signal", "repurchase_signal"]),
    contentHooks: pickSignals(signals, ["ingredient_focus", "scenario_need", "effect_skepticism", "trust_gap"]),
    topComments
  };
}

export function listCommentSignalMatches({ comments, signalKey, limit = 100, offset = 0 }) {
  const taxonomy = TAXONOMY_BY_KEY.get(signalKey);
  if (!taxonomy) {
    return {
      signal: null,
      total: 0,
      limit,
      offset,
      comments: []
    };
  }

  const matches = comments
    .map(classifyComment)
    .filter((item) => item.signalKeys.includes(signalKey))
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));

  return {
    signal: {
      key: taxonomy.key,
      label: taxonomy.label,
      description: taxonomy.description
    },
    total: matches.length,
    limit,
    offset,
    comments: matches.slice(offset, offset + limit).map((item) => toEvidence(item, signalKey))
  };
}

export function classifyComment(comment) {
  const text = String(comment.commentText ?? "");
  const normalized = text.toLowerCase();
  const signalKeys = COMMENT_SIGNAL_TAXONOMY
    .filter((taxonomy) => taxonomy.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())))
    .map((taxonomy) => taxonomy.key);

  return {
    commentId: comment.commentIdExternal || comment.id,
    commentText: text,
    likeCount: comment.likeCount ?? 0,
    signalKeys
  };
}

function toEvidence(item, signalKey = null) {
  return {
    comment_id: String(item.commentId ?? "unknown"),
    comment_text: String(item.commentText ?? ""),
    like_count: item.likeCount ?? 0,
    evidence_type: signalKey ?? item.signalKeys?.[0] ?? "comment_signal"
  };
}

function pickSignals(signals, keys) {
  return keys
    .map((key) => signals.find((signal) => signal.key === key) ?? {
      key,
      label: TAXONOMY_BY_KEY.get(key)?.label ?? key,
      count: 0,
      evidence: []
    })
    .filter((signal) => signal.count > 0);
}
