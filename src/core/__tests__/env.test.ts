import { resolveEnvOverrides } from "../env.js";

describe("resolveEnvOverrides", () => {
  const ENV_KEYS = [
    "ONPUSH_PROVIDER",
    "ONPUSH_MODEL",
    "ONPUSH_COST_LIMIT",
    "ONPUSH_OUTPUT_DIR",
    "ONPUSH_BYOK_TYPE",
    "ONPUSH_BYOK_BASE_URL",
    "ONPUSH_BYOK_API_KEY",
    "CI",
  ];

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  it("returns all undefined (except ci: false) when no env vars set", () => {
    const result = resolveEnvOverrides();
    expect(result).toEqual({
      provider: undefined,
      model: undefined,
      byok: undefined,
      outputDir: undefined,
      costLimit: undefined,
      ci: false,
    });
  });

  describe("provider", () => {
    it('returns "anthropic" for ONPUSH_PROVIDER=anthropic', () => {
      process.env.ONPUSH_PROVIDER = "anthropic";
      expect(resolveEnvOverrides().provider).toBe("anthropic");
    });

    it('returns "copilot" for ONPUSH_PROVIDER=copilot', () => {
      process.env.ONPUSH_PROVIDER = "copilot";
      expect(resolveEnvOverrides().provider).toBe("copilot");
    });

    it('returns "opencode" for ONPUSH_PROVIDER=opencode', () => {
      process.env.ONPUSH_PROVIDER = "opencode";
      expect(resolveEnvOverrides().provider).toBe("opencode");
    });

    it("returns undefined for invalid provider", () => {
      process.env.ONPUSH_PROVIDER = "openai";
      expect(resolveEnvOverrides().provider).toBeUndefined();
    });
  });

  describe("model", () => {
    it("returns model from ONPUSH_MODEL", () => {
      process.env.ONPUSH_MODEL = "claude-opus-4-6";
      expect(resolveEnvOverrides().model).toBe("claude-opus-4-6");
    });

    it("returns undefined when ONPUSH_MODEL is empty", () => {
      process.env.ONPUSH_MODEL = "";
      expect(resolveEnvOverrides().model).toBeUndefined();
    });
  });

  describe("costLimit", () => {
    it("parses numeric ONPUSH_COST_LIMIT", () => {
      process.env.ONPUSH_COST_LIMIT = "5.50";
      expect(resolveEnvOverrides().costLimit).toBe(5.5);
    });

    it("returns undefined for non-numeric value", () => {
      process.env.ONPUSH_COST_LIMIT = "abc";
      expect(resolveEnvOverrides().costLimit).toBeUndefined();
    });

    it("returns undefined when unset", () => {
      expect(resolveEnvOverrides().costLimit).toBeUndefined();
    });
  });

  describe("outputDir", () => {
    it("returns value from ONPUSH_OUTPUT_DIR", () => {
      process.env.ONPUSH_OUTPUT_DIR = "output/";
      expect(resolveEnvOverrides().outputDir).toBe("output/");
    });

    it("returns undefined when empty", () => {
      process.env.ONPUSH_OUTPUT_DIR = "";
      expect(resolveEnvOverrides().outputDir).toBeUndefined();
    });
  });

  describe("ci", () => {
    it("returns true for CI=true", () => {
      process.env.CI = "true";
      expect(resolveEnvOverrides().ci).toBe(true);
    });

    it("returns true for CI=1", () => {
      process.env.CI = "1";
      expect(resolveEnvOverrides().ci).toBe(true);
    });

    it("returns false for CI=false", () => {
      process.env.CI = "false";
      expect(resolveEnvOverrides().ci).toBe(false);
    });

    it("returns false when CI is unset", () => {
      expect(resolveEnvOverrides().ci).toBe(false);
    });
  });

  describe("byok", () => {
    it("returns byok config for valid type", () => {
      process.env.ONPUSH_BYOK_TYPE = "openai";
      const result = resolveEnvOverrides();
      expect(result.byok).toEqual({
        type: "openai",
        baseUrl: undefined,
        apiKey: undefined,
      });
    });

    it("includes baseUrl and apiKey when set", () => {
      process.env.ONPUSH_BYOK_TYPE = "azure";
      process.env.ONPUSH_BYOK_BASE_URL = "https://my-azure.openai.azure.com";
      process.env.ONPUSH_BYOK_API_KEY = "key-123";
      const result = resolveEnvOverrides();
      expect(result.byok).toEqual({
        type: "azure",
        baseUrl: "https://my-azure.openai.azure.com",
        apiKey: "key-123",
      });
    });

    it("accepts anthropic as BYOK type", () => {
      process.env.ONPUSH_BYOK_TYPE = "anthropic";
      expect(resolveEnvOverrides().byok?.type).toBe("anthropic");
    });

    it("returns undefined byok for invalid type", () => {
      process.env.ONPUSH_BYOK_TYPE = "invalid";
      expect(resolveEnvOverrides().byok).toBeUndefined();
    });
  });
});
