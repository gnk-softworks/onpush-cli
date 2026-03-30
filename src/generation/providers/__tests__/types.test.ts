import { DEFAULT_MODELS } from "../types.js";

describe("DEFAULT_MODELS", () => {
  it("has anthropic model set to claude-opus-4-6", () => {
    expect(DEFAULT_MODELS.anthropic).toBe("claude-opus-4-6");
  });

  it("has copilot model set to claude-opus-4-6", () => {
    expect(DEFAULT_MODELS.copilot).toBe("claude-opus-4-6");
  });

  it("has opencode model set to openai/gpt-5.3-codex", () => {
    expect(DEFAULT_MODELS.opencode).toBe("openai/gpt-5.3-codex");
  });

  it("has exactly 3 entries", () => {
    expect(Object.keys(DEFAULT_MODELS)).toHaveLength(3);
  });
});
