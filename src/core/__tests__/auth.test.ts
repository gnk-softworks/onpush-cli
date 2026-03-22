import {
  resolveAuth,
  resolveCopilotAuth,
  resolveAuthForProvider,
  getAgentEnv,
} from "../auth.js";

describe("resolveAuth", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns api_key type when flag provided", () => {
    const result = resolveAuth({ apiKeyFlag: "sk-test-123" });
    expect(result).toEqual({
      type: "api_key",
      provider: "anthropic",
      apiKey: "sk-test-123",
    });
  });

  it("returns env type when ANTHROPIC_API_KEY set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-env-456";
    const result = resolveAuth({});
    expect(result).toEqual({
      type: "env",
      provider: "anthropic",
      apiKey: "sk-env-456",
    });
  });

  it("returns claude_code type when no flag and no env", () => {
    const result = resolveAuth({});
    expect(result).toEqual({
      type: "claude_code",
      provider: "anthropic",
    });
  });

  it("flag takes priority over env var", () => {
    process.env.ANTHROPIC_API_KEY = "sk-env-456";
    const result = resolveAuth({ apiKeyFlag: "sk-flag-789" });
    expect(result.type).toBe("api_key");
    expect(result.apiKey).toBe("sk-flag-789");
  });

  it("claude_code result does not include apiKey", () => {
    const result = resolveAuth({});
    expect(result.apiKey).toBeUndefined();
  });
});

describe("resolveCopilotAuth", () => {
  beforeEach(() => {
    delete process.env.COPILOT_GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });

  it("returns github_token type when flag provided", () => {
    const result = resolveCopilotAuth({ githubTokenFlag: "ghp-test" });
    expect(result).toEqual({
      type: "github_token",
      provider: "copilot",
      githubToken: "ghp-test",
    });
  });

  it("returns github_env from COPILOT_GITHUB_TOKEN", () => {
    process.env.COPILOT_GITHUB_TOKEN = "ghp-copilot";
    const result = resolveCopilotAuth({});
    expect(result).toEqual({
      type: "github_env",
      provider: "copilot",
      githubToken: "ghp-copilot",
    });
  });

  it("returns github_env from GH_TOKEN when no COPILOT_GITHUB_TOKEN", () => {
    process.env.GH_TOKEN = "ghp-gh";
    const result = resolveCopilotAuth({});
    expect(result.githubToken).toBe("ghp-gh");
  });

  it("returns github_env from GITHUB_TOKEN as last env fallback", () => {
    process.env.GITHUB_TOKEN = "ghp-github";
    const result = resolveCopilotAuth({});
    expect(result.githubToken).toBe("ghp-github");
  });

  it("prefers COPILOT_GITHUB_TOKEN over GH_TOKEN", () => {
    process.env.COPILOT_GITHUB_TOKEN = "ghp-copilot";
    process.env.GH_TOKEN = "ghp-gh";
    const result = resolveCopilotAuth({});
    expect(result.githubToken).toBe("ghp-copilot");
  });

  it("prefers GH_TOKEN over GITHUB_TOKEN", () => {
    process.env.GH_TOKEN = "ghp-gh";
    process.env.GITHUB_TOKEN = "ghp-github";
    const result = resolveCopilotAuth({});
    expect(result.githubToken).toBe("ghp-gh");
  });

  it("returns github_cli type when no flag and no env", () => {
    const result = resolveCopilotAuth({});
    expect(result).toEqual({
      type: "github_cli",
      provider: "copilot",
    });
  });

  it("flag takes priority over all env vars", () => {
    process.env.COPILOT_GITHUB_TOKEN = "ghp-copilot";
    const result = resolveCopilotAuth({ githubTokenFlag: "ghp-flag" });
    expect(result.type).toBe("github_token");
    expect(result.githubToken).toBe("ghp-flag");
  });
});

describe("resolveAuthForProvider", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.COPILOT_GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });

  it("dispatches to resolveAuth for anthropic", () => {
    const result = resolveAuthForProvider("anthropic", {
      apiKeyFlag: "sk-test",
    });
    expect(result.provider).toBe("anthropic");
    expect(result.apiKey).toBe("sk-test");
  });

  it("dispatches to resolveCopilotAuth for copilot", () => {
    const result = resolveAuthForProvider("copilot", {
      githubTokenFlag: "ghp-test",
    });
    expect(result.provider).toBe("copilot");
    expect(result.githubToken).toBe("ghp-test");
  });
});

describe("getAgentEnv", () => {
  it("returns ANTHROPIC_API_KEY for anthropic with apiKey", () => {
    const env = getAgentEnv({
      type: "api_key",
      provider: "anthropic",
      apiKey: "sk-123",
    });
    expect(env).toEqual({ ANTHROPIC_API_KEY: "sk-123" });
  });

  it("returns COPILOT_GITHUB_TOKEN for copilot with githubToken", () => {
    const env = getAgentEnv({
      type: "github_token",
      provider: "copilot",
      githubToken: "ghp-123",
    });
    expect(env).toEqual({ COPILOT_GITHUB_TOKEN: "ghp-123" });
  });

  it("returns empty object for claude_code auth", () => {
    const env = getAgentEnv({ type: "claude_code", provider: "anthropic" });
    expect(env).toEqual({});
  });

  it("returns empty object for github_cli auth", () => {
    const env = getAgentEnv({ type: "github_cli", provider: "copilot" });
    expect(env).toEqual({});
  });
});
