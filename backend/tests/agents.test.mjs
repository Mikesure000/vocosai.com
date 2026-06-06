// @ts-nocheck
import { describe, it, expect } from "vitest";
import { AGENTS, getAgentByCode } from "../src/agents.mjs";

describe("Agents", () => {
  it("should have 17 agents", () => {
    expect(AGENTS.length).toBe(17);
  });

  it("each agent should have required fields", () => {
    AGENTS.forEach(a => {
      expect(a).toHaveProperty("id");
      expect(a).toHaveProperty("code");
      expect(a).toHaveProperty("name");
      expect(a).toHaveProperty("version");
      expect(a).toHaveProperty("maxRetries");
      expect(a).toHaveProperty("timeoutSeconds");
    });
  });

  it("getAgentByCode should return the correct agent", () => {
    const agent = getAgentByCode("comment_operation_agent");
    expect(agent).toBeDefined();
    expect(agent.name).toContain("评论区运营");
  });

  it("getAgentByCode should return undefined for unknown agent", () => {
    expect(getAgentByCode("nonexistent")).toBeUndefined();
  });
});
