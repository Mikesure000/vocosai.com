// @ts-nocheck
import { describe, it, expect } from "vitest";
import { validateJsonSchema } from "../src/schema-validator.mjs";

describe("Schema Validator", () => {
  it("should validate a simple object", () => {
    const result = validateJsonSchema({ name: "test" }, {
      type: "object", required: ["name"],
      properties: { name: { type: "string" } }
    });
    expect(result.ok).toBe(true);
  });

  it("should reject missing required property", () => {
    const result = validateJsonSchema({}, {
      type: "object", required: ["name"],
      properties: { name: { type: "string" } }
    });
    expect(result.ok).toBe(false);
  });

  it("should validate array with minItems", () => {
    const result = validateJsonSchema([], {
      type: "array", minItems: 1
    });
    expect(result.ok).toBe(false);
  });

  it("should validate enum", () => {
    expect(validateJsonSchema("foo", { enum: ["foo", "bar"] }).ok).toBe(true);
    expect(validateJsonSchema("baz", { enum: ["foo", "bar"] }).ok).toBe(false);
  });

  it("should validate nested objects", () => {
    const result = validateJsonSchema({ user: { name: "Alice" } }, {
      type: "object",
      properties: {
        user: { type: "object", required: ["name"], properties: { name: { type: "string" } } }
      }
    });
    expect(result.ok).toBe(true);
  });

  it("should validate string minLength", () => {
    const result = validateJsonSchema("ab", { type: "string", minLength: 3 });
    expect(result.ok).toBe(false);
  });
});
