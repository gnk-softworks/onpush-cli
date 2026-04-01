import type { AgentOptions, AgentResult, AgentProgressEvent } from "../agent.js";

export type ProviderName = "anthropic" | "copilot";

export interface DocAgentProvider {
  readonly name: ProviderName;

  /**
   * Run a documentation agent. Yields AgentProgressEvent during execution
   * and returns AgentResult when done.
   */
  runDocAgent(
    options: AgentOptions
  ): AsyncGenerator<AgentProgressEvent, AgentResult>;

  /** Called once before any generation runs (e.g. Copilot starts its client). */
  initialize?(): Promise<void>;

  /** Called after all generation is complete (e.g. Copilot stops its client). */
  shutdown?(): Promise<void>;
}

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  anthropic: "claude-opus-4-6",
  copilot: "claude-opus-4-6",
};
