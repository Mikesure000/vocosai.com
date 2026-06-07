// ============================================================
// BL-005: 归因系统 JSON Schema 定义
// 用于 AI Agent 输出验证和前端渲染规范
// ============================================================

export const ATTRIBUTION_INPUT_SCHEMA = {
  type: "object",
  required: ["content_text", "signals", "category_knowledge"],
  properties: {
    content_text: { type: "string", description: "原内容文本（标题+正文+结构）" },
    content_title: { type: "string", description: "内容标题" },
    platform: { type: "string", enum: ["douyin", "xiaohongshu", "抖音", "小红书"] },
    brand_info: { type: "string" },
    signals: {
      type: "object",
      required: ["comments"],
      properties: {
        comments: { type: "array", items: { type: "object" } },
        signals: { type: "array", items: { type: "object" } }
      }
    },
    content_decomposition: {
      type: "object",
      properties: {
        content_points: { type: "array" },
        structure: { type: "object" }
      }
    },
    category_knowledge: {
      type: "object",
      required: ["needTaxonomy", "barrierTaxonomy"],
      properties: {
        needTaxonomy: { type: "array" },
        barrierTaxonomy: { type: "array" },
        audienceSegments: { type: "array" }
      }
    }
  }
};

export const ATTRIBUTION_OUTPUT_SCHEMA = {
  type: "object",
  required: ["content_points", "attribution_matrix"],
  properties: {
    content_points: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "type", "text"],
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["hook", "selling_point", "proof", "cta", "identity", "platform_hook"] },
          position: { type: "string" },
          text: { type: "string" },
          matchedKeywords: { type: "string" }
        }
      }
    },
    attribution_matrix: {
      type: "array",
      items: {
        type: "object",
        required: ["contentPointId", "reactionType", "impactScore"],
        properties: {
          contentPointId: { type: "string" },
          contentPointText: { type: "string" },
          reactionType: { type: "string", enum: ["positive", "negative", "question", "action", "mixed"] },
          reactionCount: { type: "integer", minimum: 0 },
          impactScore: { type: "number", minimum: 0, maximum: 10 },
          sentimentDistribution: {
            type: "object",
            properties: {
              positive: { type: "integer" },
              negative: { type: "integer" },
              neutral: { type: "integer" }
            }
          },
          representativeComments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                commentId: { type: "string" },
                text: { type: "string" },
                likeCount: { type: "integer" }
              }
            }
          },
          demandSignals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                demandCode: { type: "string" },
                demandLabel: { type: "string" },
                strength: { type: "integer", minimum: 1, maximum: 5 }
              }
            }
          },
          barrierSignals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                barrierCode: { type: "string" },
                barrierLabel: { type: "string" },
                strength: { type: "string", enum: ["high", "medium", "low"] }
              }
            }
          },
          insightText: { type: "string", description: "人类可读的因果推断洞察" }
        }
      }
    },
    content_gaps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          gapTopic: { type: "string" },
          gapDescription: { type: "string" },
          recommendedAction: { type: "string" }
        }
      }
    },
    selling_point_ranking: {
      type: "array",
      items: {
        type: "object",
        properties: {
          contentPointId: { type: "string" },
          contentPointText: { type: "string" },
          positiveResonance: { type: "integer" },
          negativeCriticism: { type: "integer" },
          impactScore: { type: "number" },
          verdict: { type: "string", enum: ["high_potential", "needs_optimization", "problematic"] }
        }
      }
    },
    metadata: {
      type: "object",
      properties: {
        model: { type: "string" },
        pointCount: { type: "integer" },
        matrixSize: { type: "integer" }
      }
    }
  }
};

// 生产卡输出 Schema（BL-005扩展）
export const PRODUCTION_CARD_OUTPUT_SCHEMA = {
  type: "object",
  required: ["card_type", "title", "script_structure", "copywriting"],
  properties: {
    card_type: { type: "string", enum: ["douyin", "xiaohongshu"] },
    title: { type: "string", minLength: 5, maxLength: 100 },
    target_audience_pain_point: { type: "string" },
    hook_strategy: { type: "string" },
    script_structure: {
      type: "array",
      items: {
        type: "object",
        required: ["segment", "content"],
        properties: {
          segment: { type: "string" },
          duration: { type: "string" },
          content: { type: "string" },
          visual: { type: "string" }
        }
      }
    },
    copywriting: { type: "string" },
    asset_specs: { type: "object" },
    supporting_evidence: { type: "array", items: { type: "string" } },
    selling_points: { type: "array" },
    objection_handling: { type: "array" },
    expected_outcome: { type: "string" },
    ab_test_variables: { type: "array" }
  }
};
