import type { DocAgentProvider } from "./types.js";
import type { AgentOptions, AgentResult, AgentProgressEvent } from "../agent.js";
import { runDocAgent } from "../agent.js";

export class AnthropicProvider implements DocAgentProvider {
  readonly name = "anthropic" as const;

  async *runDocAgent(
    options: AgentOptions
  ): AsyncGenerator<AgentProgressEvent, AgentResult> {
    return yield* runDocAgent(options);
  }
}
