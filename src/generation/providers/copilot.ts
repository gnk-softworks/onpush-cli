import {
  CopilotClient,
  CopilotSession,
  approveAll,
  type SessionConfig,
} from "@github/copilot-sdk";
import type { DocAgentProvider } from "./types.js";
import type {
  AgentOptions,
  AgentResult,
  AgentProgressEvent,
} from "../agent.js";
import { getAgentEnv } from "../../core/auth.js";

const DEBUG = process.env.ONPUSH_DEBUG === "1";

function debug(slug: string, ...args: unknown[]): void {
  if (DEBUG) {
    const ts = new Date().toISOString().slice(11, 23);
    console.error(`  [debug ${ts}] [${slug}]`, ...args);
  }
}

export class CopilotProvider implements DocAgentProvider {
  readonly name = "copilot" as const;
  private client: CopilotClient | null = null;
  private authEnv: Record<string, string> = {};

  setAuth(auth: import("../../core/auth.js").AuthResult): void {
    this.authEnv = getAgentEnv(auth);
  }

  async initialize(): Promise<void> {
    // Pass auth env to the client instead of mutating process.env
    this.client = new CopilotClient({
      env: {
        ...process.env as Record<string, string>,
        ...this.authEnv,
      },
    });
    await this.client.start();
  }

  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.stop();
      this.client = null;
    }
  }

  async *runDocAgent(
    options: AgentOptions
  ): AsyncGenerator<AgentProgressEvent, AgentResult> {
    if (!this.client) {
      throw new Error(
        "CopilotProvider not initialized. Call initialize() first."
      );
    }

    const {
      systemPrompt,
      userPrompt,
      repos,
      model,
      timeout,
    } = options;

    const slug = repos[0]?.name ?? "unknown";
    const startTime = Date.now();
    let savedContent: string | null = null;
    let numTurns = 0;

    // Define custom tools for the session
    const tools = [
      {
        name: "list_repos",
        description:
          "List all repositories available for analysis. Call this first to understand what repositories you can explore.",
        parameters: {
          type: "object" as const,
          properties: {},
          required: [] as string[],
        },
        handler: () => {
          debug(slug, "list_repos called");
          const result = repos
            .map((r) => `- ${r.name}: ${r.localPath}`)
            .join("\n");
          debug(slug, "list_repos result:", result);
          return result;
        },
      },
      {
        name: "save_document",
        description:
          "Save the final generated documentation. You MUST call this tool exactly once with the complete Markdown content when you are done writing the document. Do not return the document as plain text — always use this tool.",
        parameters: {
          type: "object" as const,
          properties: {
            content: {
              type: "string",
              description:
                "The complete Markdown document content. Start with a level-1 heading. Do not include YAML frontmatter.",
            },
          },
          required: ["content"],
        },
        handler: (args: { content?: string }) => {
          debug(slug, "save_document called, content length:", args.content?.length ?? 0);
          savedContent = args.content ?? null;
          return "Document saved successfully.";
        },
      },
    ];

    // Build session config
    const sessionConfig: SessionConfig = {
      model,
      systemMessage: {
        mode: "replace" as const,
        content: systemPrompt,
      },
      tools,
      workingDirectory: repos[0]?.localPath,
      onPermissionRequest: approveAll,
    };

    // Add BYOK provider config if specified
    if (options.byok) {
      sessionConfig.provider = {
        type: options.byok.type,
        baseUrl: options.byok.baseUrl,
        ...(options.byok.apiKey ? { apiKey: options.byok.apiKey } : {}),
      };
    }

    debug(slug, "Creating session with model:", model);
    debug(slug, "workingDirectory:", repos[0]?.localPath);

    const session: CopilotSession = await this.client.createSession(
      sessionConfig
    );

    debug(slug, "Session created:", session.sessionId);

    // Set up event handlers for progress reporting
    const progressEvents: AgentProgressEvent[] = [];
    // Accumulate text content from delta events as fallback when save_document isn't called
    const textChunks: string[] = [];

    // Catch-all event listener for debugging
    session.on((event: { type: string; data?: Record<string, unknown> }) => {
      debug(slug, "Event:", event.type, JSON.stringify(event.data ?? {}).slice(0, 200));

      if (event.type === "assistant.message") {
        numTurns++;
        const data = event.data as {
          toolCalls?: Array<{ name: string }>;
        } | undefined;
        if (data?.toolCalls) {
          for (const toolCall of data.toolCalls) {
            progressEvents.push({
              type: "tool_use",
              message: `Using ${toolCall.name}`,
            });
          }
        }
      }

      if (event.type === "assistant.message_delta") {
        const data = event.data as { deltaContent?: string } | undefined;
        if (data?.deltaContent) {
          textChunks.push(data.deltaContent);
          progressEvents.push({
            type: "text",
            message: data.deltaContent.slice(0, 100),
          });
        }
      }

      if (event.type === "session.error") {
        debug(slug, "SESSION ERROR:", JSON.stringify(event.data));
      }
    });

    // Propagate SIGINT to abort the Copilot session gracefully
    const onSigint = async () => {
      debug(slug, "SIGINT received, aborting session");
      try { await session.abort(); } catch { /* best effort */ }
    };
    process.once("SIGINT", onSigint);

    try {
      // Configure abort with timeout and external signal
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (timeout) {
        timeoutId = setTimeout(async () => {
          debug(slug, "Timeout reached, aborting session");
          await session.abort();
        }, timeout * 1000);
      }
      if (options.signal) {
        const onAbort = async () => {
          debug(slug, "External abort signal received");
          await session.abort();
        };
        if (options.signal.aborted) {
          await session.abort();
        } else {
          options.signal.addEventListener("abort", onAbort, { once: true });
        }
      }

      try {
        debug(slug, "Sending prompt, timeout:", timeout ? `${timeout}s` : "none");
        // Send the user prompt and wait for completion
        const result = await session.sendAndWait(
          { prompt: userPrompt },
          timeout ? timeout * 1000 : undefined
        );

        debug(slug, "sendAndWait completed, result type:", result?.type);

        // Yield all accumulated progress events
        for (const event of progressEvents) {
          yield event;
        }

        // If save_document was never called, try to extract content from the response
        if (savedContent === null && result?.data?.content) {
          savedContent = result.data.content;
        }
        // Last resort: use accumulated text from delta events (fixes triage agent
        // which returns JSON text instead of calling save_document)
        if (savedContent === null && textChunks.length > 0) {
          savedContent = textChunks.join("");
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    } finally {
      process.removeListener("SIGINT", onSigint);
      debug(slug, "Disconnecting session");
      await session.disconnect();
    }

    const content = savedContent ?? "";
    debug(slug, "Final content length:", content.length);

    return {
      content,
      // Copilot SDK does not expose cost or token data — billed via GitHub subscription
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - startTime,
      numTurns,
    };
  }
}
