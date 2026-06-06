// @ts-nocheck
import { describe, it, expect } from "vitest";
import { COMMENT_SIGNAL_TAXONOMY, buildCommentInsights, classifyComment } from "../src/comment-insights.mjs";

describe("Comment Insights", () => {
  it("should have 13 taxonomy items", () => {
    expect(COMMENT_SIGNAL_TAXONOMY.length).toBe(13);
  });

  it("each taxonomy should have label and keywords", () => {
    COMMENT_SIGNAL_TAXONOMY.forEach(t => {
      expect(t).toHaveProperty("label");
      expect(t).toHaveProperty("keywords");
      expect(t.keywords.length).toBeGreaterThan(0);
    });
  });

  it("classifyComment should match purchase intent", () => {
    const result = classifyComment({ commentText: "想买！链接发我！" });
    expect(result.signalKeys).toContain("purchase_intent");
  });

  it("classifyComment should match price objection", () => {
    const result = classifyComment({ commentText: "太贵了，有没有平替" });
    expect(result.signalKeys).toContain("price_objection");
  });

  it("classifyComment should match safety concern", () => {
    const result = classifyComment({ commentText: "敏感肌能用吗？会不会过敏" });
    expect(result.signalKeys).toContain("safety_concern");
  });

  it("buildCommentInsights should return structured data", () => {
    const insights = buildCommentInsights({
      comments: [
        { commentText: "想买！链接发我！", normalizedText: "" },
        { commentText: "太贵了，有没有平替", normalizedText: "" },
        { commentText: "敏感肌能用吗？", normalizedText: "" },
      ]
    });
    expect(insights).toHaveProperty("signals");
    expect(insights).toHaveProperty("topBarriers");
    expect(insights).toHaveProperty("conversionSignals");
    expect(insights.signals.length).toBeGreaterThan(0);
  });

  it("should have Chinese labels", () => {
    const labels = COMMENT_SIGNAL_TAXONOMY.map(t => t.label);
    expect(labels).toContain("购买意图");
    expect(labels).toContain("价格异议");
    expect(labels).toContain("效果怀疑");
    expect(labels).toContain("安全担忧");
    expect(labels).toContain("信任缺口");
  });
});
