export interface ByokEnvOverrides {
  type?: "openai" | "azure" | "anthropic";
  baseUrl?: string;
  apiKey?: string;
}

export interface EnvOverrides {
  provider?: "anthropic" | "copilot";
  model?: string;
  byok?: ByokEnvOverrides;
  outputDir?: string;
  costLimit?: number;
  ci: boolean;
}

/**
 * Reads environment variable overrides.
 * These override config values but are themselves overridden by CLI flags.
 */
export function resolveEnvOverrides(): EnvOverrides {
  const costLimitStr = process.env.ONPUSH_COST_LIMIT;
  let costLimit: number | undefined;
  if (costLimitStr) {
    costLimit = parseFloat(costLimitStr);
    if (isNaN(costLimit)) {
      costLimit = undefined;
    }
  }

  const providerEnv = process.env.ONPUSH_PROVIDER;
  let provider: "anthropic" | "copilot" | undefined;
  if (providerEnv === "anthropic" || providerEnv === "copilot") {
    provider = providerEnv;
  }

  // BYOK env overrides for Copilot provider
  const byokTypeEnv = process.env.ONPUSH_BYOK_TYPE;
  let byok: ByokEnvOverrides | undefined;
  if (
    byokTypeEnv === "openai" ||
    byokTypeEnv === "azure" ||
    byokTypeEnv === "anthropic"
  ) {
    byok = {
      type: byokTypeEnv,
      baseUrl: process.env.ONPUSH_BYOK_BASE_URL || undefined,
      apiKey: process.env.ONPUSH_BYOK_API_KEY || undefined,
    };
  }

  return {
    provider,
    model: process.env.ONPUSH_MODEL || undefined,
    byok,
    outputDir: process.env.ONPUSH_OUTPUT_DIR || undefined,
    costLimit,
    ci: process.env.CI === "true" || process.env.CI === "1",
  };
}
