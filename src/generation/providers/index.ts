import type { DocAgentProvider, ProviderName } from "./types.js";

export async function createProvider(
  name: ProviderName
): Promise<DocAgentProvider> {
  switch (name) {
    case "anthropic": {
      const { AnthropicProvider } = await import("./anthropic.js");
      return new AnthropicProvider();
    }
    case "copilot": {
      try {
        const { CopilotProvider } = await import("./copilot.js");
        return new CopilotProvider();
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          "code" in err &&
          (err as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND"
        ) {
          throw new Error(
            "@github/copilot-sdk is required to use the copilot provider.\n" +
              "Install it with: npm install @github/copilot-sdk",
            { cause: err }
          );
        }
        throw err;
      }
    }
    case "opencode": {
      try {
        const { OpencodeProvider } = await import("./opencode.js");
        return new OpencodeProvider();
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          "code" in err &&
          (err as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND"
        ) {
          throw new Error(
            "@opencode-ai/sdk is required to use the opencode provider.\n" +
              "Install it with: npm install @opencode-ai/sdk",
            { cause: err }
          );
        }
        throw err;
      }
    }
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

export type { DocAgentProvider, ProviderName } from "./types.js";
export { DEFAULT_MODELS } from "./types.js";
