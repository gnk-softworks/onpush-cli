import { parseModelString } from "../opencode.js";

describe("parseModelString", () => {
  it("parses providerID/modelID format", () => {
    expect(parseModelString("anthropic/claude-sonnet-4-6")).toEqual({
      providerID: "anthropic",
      modelID: "claude-sonnet-4-6",
    });
  });

  it("parses openai/gpt-5.3-codex format", () => {
    expect(parseModelString("openai/gpt-5.3-codex")).toEqual({
      providerID: "openai",
      modelID: "gpt-5.3-codex",
    });
  });

  it("handles model IDs with multiple slashes", () => {
    expect(parseModelString("google/gemini/2.5-pro")).toEqual({
      providerID: "google",
      modelID: "gemini/2.5-pro",
    });
  });

  it("falls back to anthropic providerID when no slash present", () => {
    expect(parseModelString("claude-opus-4-6")).toEqual({
      providerID: "anthropic",
      modelID: "claude-opus-4-6",
    });
  });

  it("handles empty string", () => {
    expect(parseModelString("")).toEqual({
      providerID: "anthropic",
      modelID: "",
    });
  });
});
