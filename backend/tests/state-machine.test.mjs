// @ts-nocheck
import { describe, it, expect } from "vitest";
import { canTransition, assertTransition, TASK_STATUSES, nextStatusForParsedFile } from "../src/state-machine.mjs";

describe("State Machine", () => {
  it("should have 10+ task statuses", () => {
    expect(TASK_STATUSES.length).toBeGreaterThanOrEqual(10);
  });

  it("draft → uploaded should be valid", () => {
    expect(canTransition("draft", "uploaded")).toBe(true);
  });

  it("draft → analyzing should be invalid", () => {
    expect(canTransition("draft", "analyzing")).toBe(false);
  });

  it("ready → analyzing should be valid", () => {
    expect(canTransition("ready", "analyzing")).toBe(true);
  });

  it("assertTransition should not throw for valid transitions", () => {
    expect(() => assertTransition("draft", "uploaded")).not.toThrow();
  });

  it("assertTransition should throw for invalid transitions", () => {
    expect(() => assertTransition("draft", "completed")).toThrow();
  });

  it("completed → archived should be valid", () => {
    expect(canTransition("completed", "archived")).toBe(true);
  });

  it("nextStatusForParsedFile: mapping required", () => {
    expect(nextStatusForParsedFile({ needsMapping: true })).toBe("mapping_required");
  });

  it("nextStatusForParsedFile: no mapping needed", () => {
    expect(nextStatusForParsedFile({ needsMapping: false })).toBe("ready");
  });
});
