import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ResolvedRepo } from "../repos/manager.js";
import type { AuthResult } from "../core/auth.js";
import { getAgentEnv } from "../core/auth.js";
import { createOnPushServer } from "./tools/repos-tool.js";

export interface ByokConfig {
  type: "openai" | "azure" | "anthropic";
  baseUrl: string;
  apiKey?: string;
}

export interface AgentOptions {
  systemPrompt: string;
  userPrompt: string;
  repos: ResolvedRepo[];
  model: string;
  auth: AuthResult;
  byok?: ByokConfig;
  maxTurns?: number;
  maxBudgetUsd?: number;
  timeout?: number;
  signal?: AbortSignal;
}

export interface AgentResult {
  content: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  numTurns: number;
}

export interface AgentProgressEvent {
  type: "tool_use" | "text" | "progress";
  message: string;
}

/**
 * Runs a documentation generation agent. The agent explores the codebase
 * using built-in tools and produces a Markdown document via the save_document tool.
 *
 * Yields progress events during execution, then returns the final result.
 */
export async function* runDocAgent(
  options: AgentOptions
): AsyncGenerator<AgentProgressEvent, AgentResult> {
  const {
    systemPrompt,
    userPrompt,
    repos,
    model,
    auth,
    maxTurns = 50,
    maxBudgetUsd,
    timeout,
  } = options;

  // Captured document content from the save_document tool call
  let savedContent: string | null = null;

  // Set up the onpush MCP server with save_document callback
  const onpushServer = createOnPushServer(repos, (content) => {
    savedContent = content;
  });

  // Determine cwd and additional directories
  const primaryRepo = repos[0];
  const additionalDirs = repos.slice(1).map((r) => r.localPath);

  // Build environment
  const agentEnv = getAgentEnv(auth);

  // Configure abort controller with timeout and external signal
  const abortController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (timeout) {
    timeoutId = setTimeout(() => abortController.abort(), timeout * 1000);
  }
  if (options.signal) {
    if (options.signal.aborted) {
      abortController.abort();
    } else {
      options.signal.addEventListener("abort", () => abortController.abort(), { once: true });
    }
  }

  try {
    const q = query({
      prompt: userPrompt,
      options: {
        systemPrompt,
        model,
        cwd: primaryRepo.localPath,
        additionalDirectories: additionalDirs,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        disallowedTools: [
          "Write",
          "Edit",
          "MultiEdit",
          "NotebookEdit",
          "Agent",
          "TodoWrite",
        ],
        maxTurns,
        maxBudgetUsd,
        abortController,
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] != null)
          ),
          ...agentEnv,
        },
        mcpServers: {
          onpush: onpushServer,
        },
        persistSession: false,
      },
    });

    let resultCost = 0;
    let resultInputTokens = 0;
    let resultOutputTokens = 0;
    let resultDurationMs = 0;
    let resultNumTurns = 0;

    for await (const message of q) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "text") {
            yield { type: "text", message: block.text.slice(0, 100) };
          } else if (block.type === "tool_use") {
            yield {
              type: "tool_use",
              message: `Using ${block.name}`,
            };
          }
        }
      } else if (message.type === "result") {
        resultCost = message.total_cost_usd;
        resultInputTokens = message.usage.input_tokens;
        resultOutputTokens = message.usage.output_tokens;
        resultDurationMs = message.duration_ms;
        resultNumTurns = message.num_turns;
      }
    }

    // Use content captured from save_document tool call.
    // Fall back to empty string if the agent never called it.
    const content = savedContent ?? "";

    return {
      content,
      costUsd: resultCost,
      inputTokens: resultInputTokens,
      outputTokens: resultOutputTokens,
      durationMs: resultDurationMs,
      numTurns: resultNumTurns,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
