export interface AuthResult {
  type:
    | "api_key"
    | "env"
    | "claude_code"
    | "github_token"
    | "github_env"
    | "github_cli";
  provider: "anthropic" | "copilot";
  apiKey?: string;
  githubToken?: string;
}

/**
 * Resolves authentication for Anthropic using the 3-step chain:
 * 1. --anthropic-api-key flag
 * 2. ANTHROPIC_API_KEY environment variable
 * 3. Claude Code session (SDK handles this when no key is provided)
 */
export function resolveAuth(options: {
  apiKeyFlag?: string;
}): AuthResult {
  // 1. Explicit flag
  if (options.apiKeyFlag) {
    return { type: "api_key", provider: "anthropic", apiKey: options.apiKeyFlag };
  }

  // 2. Environment variable
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) {
    return { type: "env", provider: "anthropic", apiKey: envKey };
  }

  // 3. Claude Code session — the Agent SDK will attempt to use the
  // active Claude Code session when no API key is provided.
  // We return without an apiKey and let the SDK handle it.
  return { type: "claude_code", provider: "anthropic" };
}

/**
 * Resolves authentication for Copilot using the 3-step chain:
 * 1. --github-token flag
 * 2. COPILOT_GITHUB_TOKEN / GH_TOKEN / GITHUB_TOKEN environment variables
 * 3. GitHub CLI stored credentials (Copilot SDK handles this)
 */
export function resolveCopilotAuth(options: {
  githubTokenFlag?: string;
}): AuthResult {
  // 1. Explicit flag
  if (options.githubTokenFlag) {
    return {
      type: "github_token",
      provider: "copilot",
      githubToken: options.githubTokenFlag,
    };
  }

  // 2. Environment variables (Copilot SDK priority order)
  const token =
    process.env.COPILOT_GITHUB_TOKEN ??
    process.env.GH_TOKEN ??
    process.env.GITHUB_TOKEN;
  if (token) {
    return { type: "github_env", provider: "copilot", githubToken: token };
  }

  // 3. GitHub CLI / Copilot CLI stored credentials
  return { type: "github_cli", provider: "copilot" };
}

/**
 * Resolves authentication for the given provider.
 */
export function resolveAuthForProvider(
  provider: "anthropic" | "copilot",
  options: { apiKeyFlag?: string; githubTokenFlag?: string }
): AuthResult {
  if (provider === "copilot") {
    return resolveCopilotAuth({
      githubTokenFlag: options.githubTokenFlag,
    });
  }
  return resolveAuth({ apiKeyFlag: options.apiKeyFlag });
}

/**
 * Returns the environment variables to pass to the Agent SDK.
 * Sets the appropriate key based on the provider.
 */
export function getAgentEnv(auth: AuthResult): Record<string, string> {
  const env: Record<string, string> = {};
  if (auth.provider === "anthropic" && auth.apiKey) {
    env.ANTHROPIC_API_KEY = auth.apiKey;
  }
  if (auth.provider === "copilot" && auth.githubToken) {
    env.COPILOT_GITHUB_TOKEN = auth.githubToken;
  }
  return env;
}
