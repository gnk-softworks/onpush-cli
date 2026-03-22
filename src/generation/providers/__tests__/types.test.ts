import { DEFAULT_MODELS } from "../types.js";

describe("DEFAULT_MODELS", () => {
  it("has anthropic model set to claude-sonnet-4-6", () => {
    expect(DEFAULT_MODELS.anthropic).toBe("claude-sonnet-4-6");
  });

  it("has copilot model set to gpt-4.1", () => {
    expect(DEFAULT_MODELS.copilot).toBe("gpt-4.1");
  });

  it("has exactly 2 entries", () => {
    expect(Object.keys(DEFAULT_MODELS)).toHaveLength(2);
  });
});
