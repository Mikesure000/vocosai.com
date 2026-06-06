// Schemas + Prompt 模板定义
// 从部署版 agent_specs.py 迁移的真实 Agent Prompt

// ============================================================
// AI_PROMPTS — 15个 Agent 的 System Prompt 和 User Prompt Template
// 直接从部署版 agent_specs.py 的 build_prompt 提取并转换
// Python f-string {variable} → JS 模板变量 ${variable}
// ============================================================

export const AI_PROMPTS = [
  // --- 数据层 (Data) ---
  {
    id: "content_goal_prompt",
    agentCode: "task_goal_agent",
    name: "内容目标分析 Prompt",
    currentVersion: "1.0.0",
    status: "active",
    versions: [{
      id: "content_goal_prompt_v1_0_0",
      version: "1.0.0",
      outputSchemaId: "task_goal_agent_output_v1",
      defaultModel: "deepseek-v4-flash",
      systemPrompt: "你是内容分析师。分析以下内容帖子的核心目标和受众。",
      userPromptTemplate: `## 内容信息
标题：\${content_title || '无'}
正文：\${(content_body || '无').slice(0, 2000)}
平台：\${platform || '抖音'}
品牌：\${brand_name || ''}

## 已有内容项
\${JSON.stringify(content || []).slice(0, 3000)}

## 评论反馈主题
\${JSON.stringify(previous_outputs?.attribution || {}).slice(0, 1000)}

返回JSON：{"items":[{"id":1,"content_goal":"内容目标描述（如：解决价格异议/建立信任/教育用户）","target_audience":"目标受众画像","content_type":"内容类型","key_message":"核心传播信息"}]}`,
      changeLog: "从部署版迁移"
    }]
  },

  {
    id: "content_breakdown_prompt",
    agentCode: "content_decomposition_agent",
    name: "内容拆解分析 Prompt",
    currentVersion: "1.0.0",
    status: "active",
    versions: [{
      id: "content_breakdown_prompt_v1_0_0",
      version: "1.0.0",
      outputSchemaId: "content_decomposition_agent_output_v1",
      defaultModel: "deepseek-v4-flash",
      systemPrompt: "你是抖音/小红书内容拆解专家。分析以下内容的结构、卖点、缺口。",
      userPromptTemplate: `## 内容信息
标题：\${content_title || '无'}
正文：\${(content_body || '无').slice(0, 2000)}
平台：\${platform || '抖音'}
内容类型：\${content_type || ''}
品牌：\${brand_name || ''}

## 已分析的用户反馈（来自真实评论）
\${JSON.stringify(previous_outputs?.attribution || attribution || {}).slice(0, 1500)}

## 你需要回答的5个问题
1. 这条内容的标题是否有效？痛点/人群/利益/冲突有没有缺失？
2. 内容结构（开头/中段/结尾）是否合理？在哪里流失了用户？
3. 用户评论反馈暴露了内容的哪些信息缺口？（引用具体评论）
4. 卖点表达是否清楚？用户看完是否知道为什么买？
5. 下一条内容应该在哪些地方改进？（给出3-5条具体建议）

返回JSON：{"breakdowns":[{"id":1,"title_analysis":"标题有效性分析","structure_issues":["结构问题1"],"info_gaps":[{"gap":"信息缺口描述","evidence":"评论ID:X说..."}],"selling_point_score":"1-10","next_content_suggestions":["具体改进建议1"],"selling_points":["卖点1"],"engagement_hooks":["互动钩子"]}]}`,
      changeLog: "从部署版迁移"
    }]
  },

  // --- 预处理层 (Preprocess) ---
  {
    id: "dedup_prompt",
    agentCode: "comment_dedup_agent",
    name: "评论去重 Prompt",
    currentVersion: "1.0.0",
    status: "active",
    versions: [{
      id: "dedup_prompt_v1_0_0",
      version: "1.0.0",
      outputSchemaId: "comment_dedup_agent_output_v1",
      defaultModel: "deepseek-v4-flash",
      systemPrompt: "你是评论去重专家。找出内容重复或高度相似的评论。输出必须是纯JSON，不要有任何解释文字，不要markdown代码块包裹。",
      userPromptTemplate: JSON.stringify({
        task: "comment_dedup",
        comments: "${comments_snippet}",
        output_format: {
          duplicates_removed: 0,
          unique_count: 0,
          duplicate_pairs: [{ id1: 1, id2: 2, reason: "完全相同" }]
        },
        strict_rule: "你的整个回复必须是一个合法的JSON对象，以{开头以}结尾，不包含```json```标记，不包含任何解释性文字。"
      }),
      changeLog: "从部署版迁移"
    }]
  },

  {
    id: "spam_prompt",
    agentCode: "spam_filter_agent",
    name: "水军过滤 Prompt",
    currentVersion: "1.0.0",
    status: "active",
    versions: [{
      id: "spam_prompt_v1_0_0",
      version: "1.0.0",
      outputSchemaId: "spam_filter_agent_output_v1",
      defaultModel: "deepseek-v4-flash",
      systemPrompt: "你是评论水军识别助手。分析以下评论，找出疑似水军/广告/刷屏的评论并标记。输出必须是纯JSON，不要任何解释文字，不要markdown代码块包裹。注意：这不是编程任务，只需分析评论内容。",
      userPromptTemplate: JSON.stringify({
        task: "comment_spam_filter",
        comments: "${comments_snippet}",
        output_format: {
          threshold: 10,
          rules: [{ name: "规则名", type: "content/frequency/blacklist", weight: 3, enabled: true }],
          spam_ids: [1, 2]
        },
        strict_rule: "你的整个回复必须是一个合法的JSON对象，以{开头以}结尾，不包含```json```标记，不包含任何解释性文字。"
      }),
      changeLog: "从部署版迁移"
    }]
  },

  {
    id: "thread_clean_prompt",
    agentCode: "thread_cleanup_agent",
    name: "线程清洗 Prompt",
    currentVersion: "1.0.0",
    status: "active",
    versions: [{
      id: "thread_clean_prompt_v1_0_0",
      version: "1.0.0",
      outputSchemaId: "thread_cleanup_agent_output_v1",
      defaultModel: "deepseek-v4-flash",
      systemPrompt: "你是评论区回复链整理助手。将评论按主评论+子回复分组为对话线程，识别纯表情/单字/无意义跟帖等冗余回复。输出必须是纯JSON，不要任何解释文字，不要markdown代码块包裹。",
      userPromptTemplate: JSON.stringify({
        task: "comment_thread_clean",
        comments: "${comments_with_parent_snippet}",
        output_format: {
          threads_built: 0,
          redundant_removed: 0,
          threads: [{ main_id: 1, main_content: "主评论", replies: ["回复1"], redundant_replies: ["冗余ID"] }]
        },
        strict_rule: "你的整个回复必须是一个合法的JSON对象，以{开头以}结尾，不包含```json```标记，不包含任何解释性文字。"
      }),
      changeLog: "从部署版迁移"
    }]
  },

  {
    id: "deep_sentiment_prompt",
    agentCode: "sentiment_depth_agent",
    name: "情感深度分析 Prompt",
    currentVersion: "1.0.0",
    status: "active",
    versions: [{
      id: "deep_sentiment_prompt_v1_0_0",
      version: "1.0.0",
      outputSchemaId: "sentiment_depth_agent_output_v1",
      defaultModel: "deepseek-v4-flash",
      systemPrompt: "你是消费者情感分析专家。基于13维标签体系分析以下评论的情感深度。",
      userPromptTemplate: `## 13维标签体系（参考）
\${JSON.stringify(value_categories, null, 2)}

## 评论数据（已清洗）
\${JSON.stringify(comments || []).slice(0, 6000)}

## 分析要求
1. 判断每条评论的情感强度（1-5，5为最强）
2. 标注情感靶向：该评论指向哪个13维标签（可多个）
3. 判断购买信号强度：high/medium/low
4. 如有多轮对话上下文，标注情感演化方向

返回JSON：{"analyses":[{"comment_id":"评论ID","intensity":1-5,"targets":["effect_doubt","price_objection"],"purchase_signal":"high|medium|low","evolution":"情感演化描述","value_category_hint":"最适合的13维标签"}]}`,
      changeLog: "从部署版迁移"
    }]
  },

  // --- 洞察层 (Insight) ---
  {
    id: "attribution_prompt",
    agentCode: "need_barrier_agent",
    name: "评论归因分析 Prompt",
    currentVersion: "1.0.0",
    status: "active",
    versions: [{
      id: "attribution_prompt_v1_0_0",
      version: "1.0.0",
      outputSchemaId: "need_barrier_agent_output_v1",
      defaultModel: "deepseek-v4-pro",
      systemPrompt: "你是评论归因分析师。将评论归因到内容的具体要点，识别内容与用户期望的差距。",
      userPromptTemplate: `## 内容信息
标题：\${content_title || '无'}
正文：\${(content_body || '无').slice(0, 2000)}
平台：\${platform || '抖音'}
品牌：\${brand_name || ''}

## 已分析的评论数据
\${formatted_comments?.slice(0, 5000) || ''}

## 情感分析结果
\${JSON.stringify(previous_outputs?.deep_sentiment || {}).slice(0, 2000)}

## 分析要求
1. 归因到内容的具体要点（如：某句话、某个B-roll、某个数据点引发的评论）
2. 识别哪些用户需求未被内容覆盖（引用具体评论ID作为证据）
3. 发现内容的信息缺口
4. 检测竞品信号
5. 标记最有影响力的评论ID

返回JSON：{"content_reactions":[{"point":"内容要点","reaction":"正面/负面/疑问","comment_count":5,"example_comment_ids":[1,2]}],"unmet_demands":[{"demand":"需求描述","evidence":"评论ID:X说..."}],"info_gaps":[{"gap":"信息差描述","affected_comments":3}],"competitor_signals":[{"competitor":"竞品名","signal":"信号描述"}],"high_impact_comment_ids":[]}`,
      changeLog: "从部署版迁移"
    }]
  },

  {
    id: "value_type_prompt",
    agentCode: "content_value_type_agent",
    name: "评论价值分类 Prompt",
    currentVersion: "1.0.0",
    status: "active",
    versions: [{
      id: "value_type_prompt_v1_0_0",
      version: "1.0.0",
      outputSchemaId: "content_value_type_agent_output_v1",
      defaultModel: "deepseek-v4-pro",
      systemPrompt: "你是评论价值分析专家。基于以下13维标签体系对评论进行分类，并为每条高价值评论生成可执行的内容动作。",
      userPromptTemplate: `## 标签体系
\${JSON.stringify(value_categories, null, 2)}

## 当前内容上下文
内容标题：\${content_title || ''}
内容正文：\${(content_body || '').slice(0, 500)}
品牌：\${brand_name || brand?.name || ''}

## 评论数据（已清洗）
\${JSON.stringify((comments || []).slice(0, 30)).slice(0, 6000)}

## 输出要求
每条评论返回：{"id":评论ID, "primary":"一级标签code（必须是上面13个code之一）", "secondary":"二级标签code（可选，必须是上面13个code之一）", "confidence":0-1, "content_action":"具体的下一条内容动作建议（必须具体到拍什么、怎么拍）", "title_idea":"可直接用的标题建议", "evidence":"为什么这样分类的依据（引用评论原文关键词）", "value_score":1-5}

返回JSON数组：{"valued_comments":[...], "value_distribution":{"1分(无效)":0,"2分(情绪互动)":0,"3分(一般反馈)":0,"4分(明确需求)":0,"5分(可转选题)":0},"summary":"整体评论质量总结+品类趋势判断"}`,
      changeLog: "从部署版迁移"
    }]
  },

  {
    id: "high_value_filter_prompt",
    agentCode: "high_value_comment_agent",
    name: "高价值评论筛选 Prompt",
    currentVersion: "1.0.0",
    status: "active",
    versions: [{
      id: "high_value_filter_prompt_v1_0_0",
      version: "1.0.0",
      outputSchemaId: "high_value_comment_agent_output_v1",
      defaultModel: "deepseek-v4-pro",
      systemPrompt: "你是评论价值筛选助手。基于13维标签体系，在每个维度下筛选1-3条高价值评论，按P0/P1/P2优先级分组。输出必须是纯JSON，不要任何解释文字，不要markdown代码块包裹。",
      userPromptTemplate: JSON.stringify({
        task: "high_value_comment_filter",
        tags: "${value_categories_labels_json}",
        valued_comments: "${valued_comments_snippet}",
        output_format: {
          top_high_value: [{ id: 1, content: "...", value_score: 5 }],
          value_distribution: { "购买意图": 5, "价格异议": 3 },
          summary: "一句话总结"
        },
        strict_rule: "你的整个回复必须是一个合法的JSON对象，以{开头以}结尾，不包含```json```标记，不包含任何解释性文字。"
      }),
      changeLog: "从部署版迁移"
    }]
  },

  // --- 策略层 (Strategy) ---
  {
    id: "platform_strategy_prompt",
    agentCode: "platform_strategy_agent",
    name: "平台策略生成 Prompt",
    currentVersion: "1.0.0",
    status: "active",
    versions: [{
      id: "platform_strategy_prompt_v1_0_0",
      version: "1.0.0",
      outputSchemaId: "platform_strategy_agent_output_v1",
      defaultModel: "deepseek-v4-pro",
      systemPrompt: "你是多平台内容策略师。基于真实评论数据和归因分析，为抖音和小红书分别生成可执行的内容策略。",
      userPromptTemplate: `## 品牌信息
品牌：\${brand_name || ''}

## 归因分析
\${JSON.stringify(previous_outputs?.attribution || attribution || {}).slice(0, 3000)}

## 评论价值分析
\${JSON.stringify(previous_outputs?.value_type || value_type || {}).slice(0, 3000)}

## 真实评论样本
\${formatted_comments?.slice(0, 3000) || ''}

## 输出要求
- 每条策略必须引用至少2条具体评论ID作为evidence
- 抖音策略必须给出3秒钩子话术和分镜脚本方向
- 小红书策略必须给出封面方向和正文结构
- body字段必须包含具体可执行的拍摄方案（拍什么、怎么拍）

返回JSON：{"douyin_strategies":[{"title":"策略标题","priority":"P0|P1|P2","body":"完整执行方案（300字+）","evidence":["评论ID:xxx说...","评论ID:yyy说..."],"target_hook":"具体钩子话术","shot_direction":"分镜方向描述"}],"xhs_strategies":[{"title":"策略标题","priority":"P0|P1|P2","body":"完整执行方案（300字+）","evidence":["评论ID:xxx说...","评论ID:yyy说..."],"target_hook":"封面方向+标题方向","body_direction":"正文结构描述"}]}`,
      changeLog: "从部署版迁移"
    }]
  },

  {
    id: "production_card_prompt",
    agentCode: "production_card_agent",
    name: "内容生产卡 Prompt",
    currentVersion: "1.0.0",
    status: "active",
    versions: [{
      id: "production_card_prompt_v1_0_0",
      version: "1.0.0",
      outputSchemaId: "production_card_agent_output_v1",
      defaultModel: "deepseek-v4-pro",
      systemPrompt: "你是内容生产专家。根据策略和真实评论证据，同时生成抖音和小红书两套内容生产卡。",
      userPromptTemplate: `## 平台策略
\${JSON.stringify(previous_outputs?.platform_strategy || platform_strategy || {}).slice(0, 4000)}

## 归因分析
\${JSON.stringify(previous_outputs?.attribution || attribution || {}).slice(0, 2000)}

## 高价值评论
\${JSON.stringify(previous_outputs?.high_value_filter || high_value_filter || {}).slice(0, 3000)}

## 真实评论（用于提取证据）
\${formatted_comments?.slice(0, 3000) || ''}

## 输出要求：必须同时生成抖音和小红书两套生产卡！

抖音返回格式：{"douyin_cards":[{"card_id":"001","platform":"douyin","content_goal":"解决价格异议","target_user":"对价格有疑虑的人群","user_pain":"觉得贵但不理解价值","comment_evidence":["评论ID:X: 评论原文..."],"core_judgment":"用户不是嫌贵，而是不理解价值来源","content_direction":"贵在哪里的价值拆解","title":"标题","hook_3s":"前3秒钩子话术","script_structure":["步骤1"],"shot_list":[{"time":"0-3s","visual":"画面描述","voiceover":"口播文案","subtitle":"字幕文案"}],"material_needs":["需要的素材"],"selling_point":"核心卖点表达","proof":"证明机制","comment_guidance":"评论引导话术","cta":"收藏/评论/咨询/购买","ad_suggestion":"投流建议","acceptance_criteria":["验收标准"],"verification_metrics":["CTR","CVR"]}]}
小红书返回格式：{"xhs_cards":[{"card_id":"001","platform":"xhs","content_goal":"解决价格疑问","target_user":"正在比较平替的人群","user_pain":"不确定贵在哪里","comment_evidence":["评论ID:X: 评论原文..."],"core_judgment":"用户需要价值对比表而非单纯促销","content_direction":"对比测评","titles":["标题版本1","标题版本2"],"cover_text":"封面文案","keywords":["关键词"],"body_structure":[{"section":"开头","content":"..."}],"note_type":"对比测评","image_suggestions":["配图建议"],"save_point":"收藏点设计","suitable_for":"适合人群","not_suitable_for":"不适合人群","comment_guidance":"评论引导","cta":"CTA","ad_suggestion":"薯条/投流建议","acceptance_criteria":["验收标准"],"verification_metrics":["收藏率","商品点击率"]}]}`,
      changeLog: "从部署版迁移"
    }]
  },

  {
    id: "comment_ops_prompt",
    agentCode: "comment_operation_agent",
    name: "评论区运营 Prompt",
    currentVersion: "1.0.0",
    status: "active",
    versions: [{
      id: "comment_ops_prompt_v1_0_0",
      version: "1.0.0",
      outputSchemaId: "comment_operation_agent_output_v1",
      defaultModel: "deepseek-v4-pro",
      systemPrompt: "你是评论区运营专家。基于内容生产卡和真实评论数据，制定评论区精细化运营方案。",
      userPromptTemplate: `## 内容生产卡
\${JSON.stringify(production_card || {}).slice(0, 4000)}

## 当前真实评论
\${JSON.stringify(comments || []).slice(0, 3000)}

## 输出要求（必须给出具体可执行的话术，不要泛泛而谈）
1. 置顶评论：必须紧贴内容主题，引导正向讨论
2. 标准回复：按13维标签分类给回复话术（如价格异议类、效果怀疑类、使用疑问类等），每条引用具体原文
3. 负面回复：针对不同负面类型给不同回应策略（不统一回复）
4. 二次互动问题：设计3-5个能激发讨论的评论区问题
5. 私信承接：完整的私信开场白+产品分析+转化路径
6. 下一条预告：用一句话钩子引发关注

返回JSON：{"pinned_comment":"建议置顶评论（80字内）","standard_replies":[{"trigger":"价格异议","reply":"具体回复话术","apply_to":"评论ID:X"}],"negative_replies":[{"trigger":"负面体验","reply":"具体回应话术","apply_to":"评论ID:X"}],"engagement_questions":["二次互动问题1","二次互动问题2"],"private_msg_script":"完整私信承接话术（含开场+分析+引导）","next_content_hook":"下一条内容预告话术"}`,
      changeLog: "从部署版迁移"
    }]
  },

  {
    id: "ad_fit_score_prompt",
    agentCode: "ad_fit_agent",
    name: "投流适配评分 Prompt",
    currentVersion: "1.0.0",
    status: "active",
    versions: [{
      id: "ad_fit_score_prompt_v1_0_0",
      version: "1.0.0",
      outputSchemaId: "ad_fit_agent_output_v1",
      defaultModel: "deepseek-v4-pro",
      systemPrompt: "你是内容投流适配分析专家。基于内容生产卡和真实用户评论，评估该内容是否适合投放付费流量，并进行多维度打分。",
      userPromptTemplate: `## 内容生产卡（含分镜脚本和执行方案）
\${JSON.stringify(production_card || {}).slice(0, 3000)}

## 真实用户评论样本
\${formatted_comments?.slice(0, 1500) || ''}

## 评估维度（1-10分）
1. 合规性：内容是否无敏感词、无夸张宣传、不违反平台规则
2. 完播潜力：前3秒钩子是否足够吸引人，完播率预估
3. 转化潜力：评论区是否出现了购买信号，CTA是否清晰
4. 受众匹配：内容目标受众是否与广告投放人群一致
5. 信任构建：是否包含足够的证明机制（前后对比、真人验证、数据引用）
6. 互动设计：评论区引导、收藏点设计是否到位
7. 素材复用度：内容中的画面/文案是否可被投流素材直接引用

返回JSON：{"score":75,"conclusion":"适合投流|需优化后投流|不适合投流","dimensions":{"合规性":8,"完播潜力":7,"转化潜力":6,"受众匹配":8,"信任构建":5,"互动设计":7,"素材复用度":6},"target_audience":"推荐投放人群画像","test_variables":["可测试的投放变量1"],"risks":["投放风险1"],"required_changes":["投流前必须修改的内容"],"reason":"综合评分依据的详细说明"}`,
      changeLog: "从部署版迁移"
    }]
  },

  {
    id: "pre_publish_qa_prompt",
    agentCode: "pre_publish_check_agent",
    name: "发布前质检 Prompt",
    currentVersion: "1.0.0",
    status: "active",
    versions: [{
      id: "pre_publish_qa_prompt_v1_0_0",
      version: "1.0.0",
      outputSchemaId: "pre_publish_check_agent_output_v1",
      defaultModel: "deepseek-v4-pro",
      systemPrompt: "你是内容发布前质检员。对照内容生产卡的验收标准，逐项检查脚本/笔记草稿是否达标，识别发布风险。",
      userPromptTemplate: `## 内容生产卡（含验收标准）
\${JSON.stringify(production_card || {}).slice(0, 2000)}

## 待质检草稿文本
\${(draft_text || '').slice(0, 3000)}

## 质检项目
1. 标题质量：是否包含痛点/人群/利益/冲突
2. 钩子有效性：前3秒是否能抓住目标受众
3. 证明完整性：是否引用了评论证据、数据、真实案例
4. 卖点表达：用户看完是否知道为什么买
5. CTA设计：是否有明确的下一步引导
6. 合规检查：无违禁词、无绝对化用语、无夸大宣传
7. 评论引导：是否有设计的评论区互动钩子
8. 价值密度：每条信息是否服务于转化目标

返回JSON：{"publish_risks":[{"risk":"风险描述","severity":"high|medium|low","section":"具体段落"}],"required_fixes":[{"fix":"修改建议","reason":"为什么需要修改","section":"目标段落"}],"go_no_go":"go|no_go|conditional_go","overall_score":1-10,"summary":"整体质检结论"}`,
      changeLog: "从部署版迁移"
    }]
  },

  // --- 治理层 (Governance) ---
  {
    id: "ai_quality_prompt",
    agentCode: "ai_quality_eval_agent",
    name: "AI 质量评估 Prompt",
    currentVersion: "1.0.0",
    status: "active",
    versions: [{
      id: "ai_quality_prompt_v1_0_0",
      version: "1.0.0",
      outputSchemaId: "ai_quality_eval_agent_output_v1",
      defaultModel: "deepseek-v4-pro",
      systemPrompt: "你是AI输出质量评估专家。评估本轮Agent执行的整体质量，统计各阶段成功率、证据引用率和可操作性，判断是否符合交付标准。",
      userPromptTemplate: JSON.stringify({
        task: "quality_assessment",
        metrics: {
          total_agents_run: "${total_agents}",
          agents_succeeded: "${agents_succeeded}",
          agents_failed: "${agents_failed}",
          outputs_with_evidence: "${outputs_with_evidence}"
        },
        all_agent_outputs: "${all_agent_outputs_snippet}",
        output_format: {
          total_agents_run: 0,
          agents_succeeded: 0,
          agents_failed: 0,
          success_rate: 0,
          evidence_coverage: 0,
          actionable_rate: 0,
          failed_agents: [],
          quality_findings: [],
          missing_evidence: [],
          iteration_actions: [],
          overall_assessment: ""
        },
        strict_rule: "你的整个回复必须是一个合法的JSON对象，以{开头以}结尾，不包含```json```标记，不包含任何解释性文字。"
      }),
      changeLog: "从部署版迁移"
    }]
  },

  // --- 报告组装 (Report Assembly) ---
  {
    id: "report_assembly_prompt",
    agentCode: "report_assembly_agent",
    name: "报告组装 Prompt",
    currentVersion: "1.0.0",
    status: "active",
    versions: [{
      id: "report_assembly_prompt_v1_0_0",
      version: "1.0.0",
      outputSchemaId: "report_assembly_agent_output_v1",
      defaultModel: "deepseek-v4-pro",
      systemPrompt: "你是消费者洞察报告汇编专家。将所有Agent的分析结果整合为一份客户可交付的消费者之声洞察报告。",
      userPromptTemplate: `## 任务上下文
平台：\${platform || '抖音'}
品牌：\${brand_name || ''}
内容标题：\${content_title || '无'}

## 各Agent分析结果汇总
\${all_agent_context_snippet || ''}

## 报告结构要求
1. 执行摘要（300字内）: 本轮分析的3个核心发现 + 3个优先级最高的行动建议
2. 消费者信号图谱: 按13维标签体系展示评论情绪分布和热门话题
3. 内容诊断: 原内容为什么引发这些评论，哪里没讲清楚
4. 需求与障碍: 用户未被满足的需求 + 购买障碍 + 竞品信号
5. 策略与生产卡: 下一条内容的完整执行方案（抖音+小红书双平台）
6. 评论区运营: 置顶评论 + 分标签回复话术 + 私信承接流程
7. 投流建议: 是否适合投流 + 投流方向 + A/B测试变量
8. 下周行动计划: 3-5条具体的、可分配给团队的任务

返回JSON：{"executive_summary":"执行摘要","consumer_signal_map":"信号图谱描述","content_diagnosis":"内容诊断结论","needs_barriers":{"unmet_demands":[],"purchase_barriers":[],"competitor_signals":[]},"strategy_playbook":{"douyin":{},"xiaohongshu":{}},"comment_ops_plan":{"pinned_comment":"","reply_playbook":[],"dm_script":""},"ad_recommendation":{"verdict":"","reason":"","test_variables":[]},"next_week_plan":[],"client_deliverables":[]}`,
      changeLog: "从部署版迁移"
    }]
  }
];

// ============================================================
// AI_SCHEMAS — Agent Output Schema 定义
// 对齐部署版 agent_specs.py 的实际输出格式
// ============================================================

const AGENT_OUTPUT_SCHEMAS = [
  // --- 数据层 ---
  {
    id: "task_goal_agent_output_v1",
    name: "内容目标分析 Output",
    version: "1.0.0",
    status: "active",
    schema: {
      type: "object",
      required: ["items"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "content_goal", "target_audience", "content_type", "key_message"],
            properties: {
              id: { type: "integer" },
              content_goal: { type: "string", description: "内容目标描述" },
              target_audience: { type: "string", description: "目标受众画像" },
              content_type: { type: "string", description: "内容类型" },
              key_message: { type: "string", description: "核心传播信息" }
            }
          }
        }
      }
    }
  },

  {
    id: "content_decomposition_agent_output_v1",
    name: "内容拆解分析 Output",
    version: "1.0.0",
    status: "active",
    schema: {
      type: "object",
      required: ["breakdowns"],
      properties: {
        breakdowns: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "title_analysis", "structure_issues", "info_gaps", "selling_point_score", "next_content_suggestions"],
            properties: {
              id: { type: "integer" },
              title_analysis: { type: "string", description: "标题有效性分析" },
              structure_issues: { type: "array", items: { type: "string" }, description: "结构问题列表" },
              info_gaps: {
                type: "array",
                items: {
                  type: "object",
                  required: ["gap", "evidence"],
                  properties: {
                    gap: { type: "string", description: "信息缺口描述" },
                    evidence: { type: "string", description: "评论证据" }
                  }
                }
              },
              selling_point_score: { type: "string", description: "卖点评分 1-10" },
              next_content_suggestions: { type: "array", items: { type: "string" } },
              selling_points: { type: "array", items: { type: "string" } },
              engagement_hooks: { type: "array", items: { type: "string" } }
            }
          }
        }
      }
    }
  },

  // --- 预处理层 ---
  {
    id: "comment_dedup_agent_output_v1",
    name: "评论去重 Output",
    version: "1.0.0",
    status: "active",
    schema: {
      type: "object",
      required: ["duplicates_removed", "unique_count"],
      properties: {
        duplicates_removed: { type: "integer" },
        unique_count: { type: "integer" },
        duplicate_pairs: {
          type: "array",
          items: {
            type: "object",
            required: ["id1", "id2", "reason"],
            properties: {
              id1: { type: "integer" },
              id2: { type: "integer" },
              reason: { type: "string" }
            }
          }
        }
      }
    }
  },

  {
    id: "spam_filter_agent_output_v1",
    name: "水军过滤 Output",
    version: "1.0.0",
    status: "active",
    schema: {
      type: "object",
      required: ["threshold", "rules", "spam_ids"],
      properties: {
        threshold: { type: "integer" },
        rules: {
          type: "array",
          items: {
            type: "object",
            required: ["name", "type", "weight", "enabled"],
            properties: {
              name: { type: "string" },
              type: { type: "string", enum: ["content", "frequency", "blacklist"] },
              weight: { type: "integer" },
              enabled: { type: "boolean" }
            }
          }
        },
        spam_ids: { type: "array", items: { type: "integer" } }
      }
    }
  },

  {
    id: "thread_cleanup_agent_output_v1",
    name: "线程清洗 Output",
    version: "1.0.0",
    status: "active",
    schema: {
      type: "object",
      required: ["threads_built", "redundant_removed"],
      properties: {
        threads_built: { type: "integer" },
        redundant_removed: { type: "integer" },
        threads: {
          type: "array",
          items: {
            type: "object",
            required: ["main_id", "main_content"],
            properties: {
              main_id: { type: "integer" },
              main_content: { type: "string" },
              replies: { type: "array", items: { type: "string" } },
              redundant_replies: { type: "array", items: { type: "string" } }
            }
          }
        }
      }
    }
  },

  {
    id: "sentiment_depth_agent_output_v1",
    name: "情感深度分析 Output",
    version: "1.0.0",
    status: "active",
    schema: {
      type: "object",
      required: ["analyses"],
      properties: {
        analyses: {
          type: "array",
          items: {
            type: "object",
            required: ["comment_id", "intensity", "targets", "purchase_signal"],
            properties: {
              comment_id: { type: "string", description: "评论ID" },
              intensity: { type: "integer", minimum: 1, maximum: 5, description: "情感强度 1-5" },
              targets: { 
                type: "array", 
                items: { type: "string" },
                description: "情感靶向标签code"
              },
              purchase_signal: { 
                type: "string", 
                enum: ["high", "medium", "low"],
                description: "购买信号强度"
              },
              evolution: { type: "string", description: "情感演化描述" },
              value_category_hint: { type: "string", description: "最适合的13维标签" }
            }
          }
        }
      }
    }
  },

  // --- 洞察层 ---
  {
    id: "need_barrier_agent_output_v1",
    name: "评论归因分析 Output",
    version: "1.0.0",
    status: "active",
    schema: {
      type: "object",
      required: ["content_reactions", "unmet_demands", "info_gaps"],
      properties: {
        content_reactions: {
          type: "array",
          items: {
            type: "object",
            required: ["point", "reaction", "comment_count", "example_comment_ids"],
            properties: {
              point: { type: "string", description: "内容要点" },
              reaction: { type: "string", description: "正面/负面/疑问" },
              comment_count: { type: "integer" },
              example_comment_ids: { type: "array", items: { type: "integer" } }
            }
          }
        },
        unmet_demands: {
          type: "array",
          items: {
            type: "object",
            required: ["demand", "evidence"],
            properties: {
              demand: { type: "string", description: "需求描述" },
              evidence: { type: "string", description: "评论证据" }
            }
          }
        },
        info_gaps: {
          type: "array",
          items: {
            type: "object",
            required: ["gap", "affected_comments"],
            properties: {
              gap: { type: "string", description: "信息差描述" },
              affected_comments: { type: "integer" }
            }
          }
        },
        competitor_signals: {
          type: "array",
          items: {
            type: "object",
            required: ["competitor", "signal"],
            properties: {
              competitor: { type: "string" },
              signal: { type: "string" }
            }
          }
        },
        high_impact_comment_ids: { type: "array", items: { type: "integer" } }
      }
    }
  },

  {
    id: "content_value_type_agent_output_v1",
    name: "评论价值分类 Output",
    version: "1.0.0",
    status: "active",
    schema: {
      type: "object",
      required: ["valued_comments", "value_distribution", "summary"],
      properties: {
        valued_comments: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "primary", "confidence", "content_action", "title_idea", "evidence"],
            properties: {
              id: { type: ["string", "integer"], description: "评论ID" },
              primary: { type: "string", description: "一级标签code（13维之一）" },
              secondary: { type: "string", description: "二级标签code（可选）" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              content_action: { type: "string", description: "具体的下一条内容动作建议" },
              title_idea: { type: "string", description: "可直接用的标题建议" },
              evidence: { type: "string", description: "分类依据" },
              value_score: { type: "integer", minimum: 1, maximum: 5 }
            }
          }
        },
        value_distribution: {
          type: "object",
          properties: {
            "1分(无效)": { type: "integer" },
            "2分(情绪互动)": { type: "integer" },
            "3分(一般反馈)": { type: "integer" },
            "4分(明确需求)": { type: "integer" },
            "5分(可转选题)": { type: "integer" }
          }
        },
        summary: { type: "string", description: "整体评论质量总结+品类趋势判断" }
      }
    }
  },

  {
    id: "high_value_comment_agent_output_v1",
    name: "高价值评论筛选 Output",
    version: "1.0.0",
    status: "active",
    schema: {
      type: "object",
      required: ["top_high_value", "value_distribution", "summary"],
      properties: {
        top_high_value: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "content"],
            properties: {
              id: { type: "integer" },
              content: { type: "string" },
              value_score: { type: "integer", minimum: 1, maximum: 5 }
            }
          }
        },
        top_purchase_intent: { type: "array" },
        top_price_objection: { type: "array" },
        top_competitor: { type: "array" },
        top_usage_question: { type: "array" },
        top_user_quotes_titles: { type: "array" },
        top_user_quotes_scripts: { type: "array" },
        value_distribution: { type: "object" },
        summary: { type: "string" }
      }
    }
  },

  // --- 策略层 ---
  {
    id: "platform_strategy_agent_output_v1",
    name: "平台策略生成 Output",
    version: "1.0.0",
    status: "active",
    schema: {
      type: "object",
      required: ["douyin_strategies", "xhs_strategies"],
      properties: {
        douyin_strategies: {
          type: "array",
          items: {
            type: "object",
            required: ["title", "priority", "body"],
            properties: {
              title: { type: "string", description: "策略标题" },
              priority: { type: "string", enum: ["P0", "P1", "P2"] },
              body: { type: "string", description: "完整执行方案（300字+）" },
              evidence: { type: "array", items: { type: "string" } },
              target_hook: { type: "string", description: "具体钩子话术" },
              shot_direction: { type: "string", description: "分镜方向描述" }
            }
          }
        },
        xhs_strategies: {
          type: "array",
          items: {
            type: "object",
            required: ["title", "priority", "body"],
            properties: {
              title: { type: "string", description: "策略标题" },
              priority: { type: "string", enum: ["P0", "P1", "P2"] },
              body: { type: "string", description: "完整执行方案（300字+）" },
              evidence: { type: "array", items: { type: "string" } },
              target_hook: { type: "string", description: "封面方向+标题方向" },
              body_direction: { type: "string", description: "正文结构描述" }
            }
          }
        }
      }
    }
  },

  {
    id: "production_card_agent_output_v1",
    name: "内容生产卡 Output",
    version: "1.0.0",
    status: "active",
    schema: {
      type: "object",
      required: ["douyin_cards", "xhs_cards"],
      properties: {
        douyin_cards: {
          type: "array",
          items: {
            type: "object",
            required: ["card_id", "platform", "content_goal", "target_user", "user_pain", "comment_evidence", "core_judgment", "content_direction", "title", "hook_3s"],
            properties: {
              card_id: { type: "string" },
              platform: { type: "string", enum: ["douyin"] },
              content_goal: { type: "string" },
              target_user: { type: "string" },
              user_pain: { type: "string" },
              comment_evidence: { type: "array", items: { type: "string" } },
              core_judgment: { type: "string" },
              content_direction: { type: "string" },
              title: { type: "string" },
              hook_3s: { type: "string", description: "前3秒钩子话术" },
              script_structure: { type: "array", items: { type: "string" } },
              shot_list: {
                type: "array",
                items: {
                  type: "object",
                  required: ["time", "visual", "voiceover", "subtitle"],
                  properties: {
                    time: { type: "string" },
                    visual: { type: "string" },
                    voiceover: { type: "string" },
                    subtitle: { type: "string" }
                  }
                }
              },
              material_needs: { type: "array", items: { type: "string" } },
              selling_point: { type: "string" },
              proof: { type: "string" },
              comment_guidance: { type: "string" },
              cta: { type: "string" },
              ad_suggestion: { type: "string" },
              acceptance_criteria: { type: "array", items: { type: "string" } },
              verification_metrics: { type: "array", items: { type: "string" } }
            }
          }
        },
        xhs_cards: {
          type: "array",
          items: {
            type: "object",
            required: ["card_id", "platform", "content_goal", "target_user", "user_pain", "comment_evidence", "core_judgment", "content_direction"],
            properties: {
              card_id: { type: "string" },
              platform: { type: "string", enum: ["xhs"] },
              content_goal: { type: "string" },
              target_user: { type: "string" },
              user_pain: { type: "string" },
              comment_evidence: { type: "array", items: { type: "string" } },
              core_judgment: { type: "string" },
              content_direction: { type: "string" },
              titles: { type: "array", items: { type: "string" } },
              cover_text: { type: "string" },
              keywords: { type: "array", items: { type: "string" } },
              body_structure: {
                type: "array",
                items: {
                  type: "object",
                  required: ["section", "content"],
                  properties: {
                    section: { type: "string" },
                    content: { type: "string" }
                  }
                }
              },
              note_type: { type: "string" },
              image_suggestions: { type: "array", items: { type: "string" } },
              save_point: { type: "string" },
              suitable_for: { type: "string" },
              not_suitable_for: { type: "string" },
              comment_guidance: { type: "string" },
              cta: { type: "string" },
              ad_suggestion: { type: "string" },
              acceptance_criteria: { type: "array", items: { type: "string" } },
              verification_metrics: { type: "array", items: { type: "string" } }
            }
          }
        }
      }
    }
  },

  {
    id: "comment_operation_agent_output_v1",
    name: "评论区运营 Output",
    version: "1.0.0",
    status: "active",
    schema: {
      type: "object",
      required: ["pinned_comment", "standard_replies", "negative_replies", "engagement_questions", "private_msg_script", "next_content_hook"],
      properties: {
        pinned_comment: { type: "string", description: "建议置顶评论（80字内）" },
        standard_replies: {
          type: "array",
          items: {
            type: "object",
            required: ["trigger", "reply", "apply_to"],
            properties: {
              trigger: { type: "string", description: "触发信号（如：价格异议）" },
              reply: { type: "string", description: "具体回复话术" },
              apply_to: { type: "string", description: "评论ID" }
            }
          }
        },
        negative_replies: {
          type: "array",
          items: {
            type: "object",
            required: ["trigger", "reply", "apply_to"],
            properties: {
              trigger: { type: "string", description: "负面类型" },
              reply: { type: "string", description: "具体回应话术" },
              apply_to: { type: "string", description: "评论ID" }
            }
          }
        },
        engagement_questions: { type: "array", items: { type: "string" }, description: "二次互动问题" },
        private_msg_script: { type: "string", description: "完整私信承接话术" },
        next_content_hook: { type: "string", description: "下一条内容预告话术" }
      }
    }
  },

  {
    id: "ad_fit_agent_output_v1",
    name: "投流适配评分 Output",
    version: "1.0.0",
    status: "active",
    schema: {
      type: "object",
      required: ["score", "conclusion", "dimensions", "target_audience", "test_variables", "risks", "required_changes", "reason"],
      properties: {
        score: { type: "integer", minimum: 0, maximum: 100 },
        conclusion: { type: "string", description: "适合投流|需优化后投流|不适合投流" },
        dimensions: {
          type: "object",
          description: "各维度得分 1-10",
          properties: {
            "合规性": { type: "integer" },
            "完播潜力": { type: "integer" },
            "转化潜力": { type: "integer" },
            "受众匹配": { type: "integer" },
            "信任构建": { type: "integer" },
            "互动设计": { type: "integer" },
            "素材复用度": { type: "integer" }
          }
        },
        target_audience: { type: "string", description: "推荐投放人群画像" },
        test_variables: { type: "array", items: { type: "string" }, description: "可测试的投放变量" },
        risks: { type: "array", items: { type: "string" }, description: "投放风险" },
        required_changes: { type: "array", items: { type: "string" }, description: "投流前必须修改的内容" },
        reason: { type: "string", description: "综合评分依据的详细说明" }
      }
    }
  },

  {
    id: "pre_publish_check_agent_output_v1",
    name: "发布前质检 Output",
    version: "1.0.0",
    status: "active",
    schema: {
      type: "object",
      required: ["publish_risks", "required_fixes", "go_no_go"],
      properties: {
        publish_risks: {
          type: "array",
          items: {
            type: "object",
            required: ["risk", "severity", "section"],
            properties: {
              risk: { type: "string", description: "风险描述" },
              severity: { type: "string", enum: ["high", "medium", "low"] },
              section: { type: "string", description: "具体段落" }
            }
          }
        },
        required_fixes: {
          type: "array",
          items: {
            type: "object",
            required: ["fix", "reason", "section"],
            properties: {
              fix: { type: "string", description: "修改建议" },
              reason: { type: "string", description: "为什么需要修改" },
              section: { type: "string", description: "目标段落" }
            }
          }
        },
        go_no_go: { type: "string", enum: ["go", "no_go", "conditional_go"] },
        overall_score: { type: "integer", minimum: 1, maximum: 10 },
        summary: { type: "string", description: "整体质检结论" }
      }
    }
  },

  // --- 治理层 ---
  {
    id: "ai_quality_eval_agent_output_v1",
    name: "AI 质量评估 Output",
    version: "1.0.0",
    status: "active",
    schema: {
      type: "object",
      required: ["total_agents_run", "agents_succeeded", "agents_failed", "success_rate", "quality_findings", "iteration_actions"],
      properties: {
        total_agents_run: { type: "integer" },
        agents_succeeded: { type: "integer" },
        agents_failed: { type: "integer" },
        success_rate: { type: "number", minimum: 0, maximum: 1 },
        evidence_coverage: { type: "number", minimum: 0, maximum: 1 },
        actionable_rate: { type: "number", minimum: 0, maximum: 1 },
        failed_agents: { type: "array", items: { type: "string" } },
        quality_findings: {
          type: "array",
          items: {
            type: "object",
            required: ["agent_id", "finding", "severity"],
            properties: {
              agent_id: { type: "string" },
              finding: { type: "string" },
              severity: { type: "string", enum: ["high", "medium", "low"] }
            }
          }
        },
        missing_evidence: {
          type: "array",
          items: {
            type: "object",
            required: ["agent_id", "field", "reason"],
            properties: {
              agent_id: { type: "string" },
              field: { type: "string" },
              reason: { type: "string" }
            }
          }
        },
        iteration_actions: {
          type: "array",
          items: {
            type: "object",
            required: ["action", "target_agent", "priority"],
            properties: {
              action: { type: "string" },
              target_agent: { type: "string" },
              priority: { type: "string", enum: ["P0", "P1", "P2"] }
            }
          }
        },
        overall_assessment: { type: "string" }
      }
    }
  },

  // --- 报告组装 ---
  {
    id: "report_assembly_agent_output_v1",
    name: "报告组装 Output",
    version: "1.0.0",
    status: "active",
    schema: {
      type: "object",
      required: ["executive_summary", "content_diagnosis", "needs_barriers", "strategy_playbook", "comment_ops_plan", "ad_recommendation", "next_week_plan", "client_deliverables"],
      properties: {
        executive_summary: { type: "string", description: "执行摘要（300字内）" },
        consumer_signal_map: { type: "string", description: "消费者信号图谱" },
        content_diagnosis: { type: "string", description: "内容诊断结论" },
        needs_barriers: {
          type: "object",
          properties: {
            unmet_demands: { type: "array" },
            purchase_barriers: { type: "array" },
            competitor_signals: { type: "array" }
          }
        },
        strategy_playbook: {
          type: "object",
          properties: {
            douyin: { type: "object" },
            xiaohongshu: { type: "object" }
          }
        },
        comment_ops_plan: {
          type: "object",
          required: ["pinned_comment", "reply_playbook", "dm_script"],
          properties: {
            pinned_comment: { type: "string" },
            reply_playbook: { type: "array" },
            dm_script: { type: "string" }
          }
        },
        ad_recommendation: {
          type: "object",
          required: ["verdict", "reason"],
          properties: {
            verdict: { type: "string" },
            reason: { type: "string" },
            test_variables: { type: "array", items: { type: "string" } }
          }
        },
        next_week_plan: {
          type: "array",
          items: {
            type: "object",
            required: ["action", "priority", "owner"],
            properties: {
              action: { type: "string" },
              priority: { type: "string", enum: ["P0", "P1", "P2"] },
              owner: { type: "string" }
            }
          }
        },
        client_deliverables: { type: "array", items: { type: "string" } }
      }
    }
  }
];

// ============================================================
// 导出 AI_SCHEMAS（向后兼容）
// ============================================================

export const AI_SCHEMAS = [
  {
    id: "agent_standard_output_v1",
    name: "Agent Standard Output",
    version: "v1",
    status: "active",
    schema: {
      type: "object",
      required: ["task_id", "agent", "model", "prompt_version", "status", "summary", "evidence", "result", "risk_flags", "confidence_score"],
      properties: {
        task_id: { type: "string", minLength: 1 },
        agent: { type: "string", minLength: 1 },
        model: { type: "string", minLength: 1 },
        prompt_version: { type: "string", minLength: 1 },
        status: { type: "string", enum: ["success", "failed", "partial"] },
        summary: { type: "string", minLength: 1 },
        evidence: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["comment_id", "comment_text", "evidence_type"],
            properties: {
              comment_id: { type: "string", minLength: 1 },
              comment_text: { type: "string", minLength: 1 },
              evidence_type: { type: "string", minLength: 1 }
            }
          }
        },
        result: { type: "object" },
        risk_flags: { type: "array" },
        confidence_score: { type: "number", minimum: 0, maximum: 1 }
      }
    }
  },
  ...AGENT_OUTPUT_SCHEMAS
];

// ============================================================
// 公共 API
// ============================================================

export function getSchemaById(id) {
  return AI_SCHEMAS.find((schema) => schema.id === id) ?? null;
}

export function getActivePromptForAgent(agentCode) {
  return AI_PROMPTS.find((prompt) => prompt.agentCode === agentCode)
    ?? AI_PROMPTS.find((prompt) => prompt.agentCode === "*")
    ?? null;
}

/**
 * 渲染 Prompt 模板 — 将 ${variable} 占位符替换为实际值
 * @param {string} template - 包含 ${variable} 占位符的模板字符串
 * @param {object} ctx - 上下文对象，key 为变量名
 * @returns {string} 渲染后的文本
 */
export function renderPromptTemplate(template, ctx = {}) {
  return template.replace(/\$\{([^}]+)\}/g, (_match, expr) => {
    try {
      const fn = new Function(...Object.keys(ctx), `return ${expr};`);
      return String(fn(...Object.values(ctx)) ?? '');
    } catch {
      return `\${${expr}}`;
    }
  });
}
