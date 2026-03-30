import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { DocAgentProvider } from "./types.js";
import type {
  AgentOptions,
  AgentResult,
  AgentProgressEvent,
} from "../agent.js";
import type { ResolvedRepo } from "../../repos/manager.js";
import type { OpencodeClient } from "@opencode-ai/sdk";

const DEBUG = process.env.ONPUSH_DEBUG === "1";

function debug(slug: string, ...args: unknown[]): void {
  if (DEBUG) {
    const ts = new Date().toISOString().slice(11, 23);
    console.error(`  [debug ${ts}] [${slug}]`, ...args);
  }
}

/**
 * Parses a "providerID/modelID" string into its components.
 * Falls back to providerID "anthropic" if no slash is present.
 */
export function parseModelString(model: string): {
  providerID: string;
  modelID: string;
} {
  const slashIndex = model.indexOf("/");
  if (slashIndex === -1) {
    return { providerID: "anthropic", modelID: model };
  }
  return {
    providerID: model.slice(0, slashIndex),
    modelID: model.slice(slashIndex + 1),
  };
}

/**
 * Resolves the path to the compiled MCP stdio server script.
 */
function getMcpServerPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return join(dirname(thisFile), "..", "tools", "mcp-stdio-server.js");
}

export class OpencodeProvider implements DocAgentProvider {
  readonly name = "opencode" as const;
  private opencode: {
    client: OpencodeClient;
    server: { url: string; close(): void };
  } | null = null;
  private auth: import("../../core/auth.js").AuthResult | null = null;
  private mcpRegistered = false;

  setAuth(auth: import("../../core/auth.js").AuthResult): void {
    this.auth = auth;
  }

  async initialize(): Promise<void> {
    const { createOpencode } = await import("@opencode-ai/sdk");
    this.opencode = await createOpencode({ port: 0 });

    // If an API key was provided, configure it in OpenCode
    if (this.auth?.apiKey) {
      await this.opencode.client.auth.set({
        path: { id: "anthropic" },
        body: { type: "api", key: this.auth.apiKey },
      });
    }
  }

  async shutdown(): Promise<void> {
    if (this.opencode) {
      this.opencode.server.close();
      this.opencode = null;
      this.mcpRegistered = false;
    }
  }

  /**
   * Registers the onpush MCP server with OpenCode dynamically.
   * The server exposes list_repos and save_document tools.
   */
  private async registerMcpServer(
    repos: ResolvedRepo[],
    outputFile: string
  ): Promise<void> {
    if (!this.opencode) return;

    const serverPath = getMcpServerPath();
    debug("mcp", "Registering MCP server at:", serverPath);

    await this.opencode.client.mcp.add({
      body: {
        name: "onpush",
        config: {
          type: "local",
          command: ["node", serverPath],
          environment: {
            ONPUSH_REPOS: JSON.stringify(
              repos.map((r) => ({
                name: r.name,
                localPath: r.localPath,
                type: r.type,
              }))
            ),
            ONPUSH_OUTPUT_FILE: outputFile,
          },
        },
      },
    });

    this.mcpRegistered = true;
    debug("mcp", "MCP server registered");
  }

  async *runDocAgent(
    options: AgentOptions
  ): AsyncGenerator<AgentProgressEvent, AgentResult> {
    if (!this.opencode) {
      throw new Error(
        "OpencodeProvider not initialized. Call initialize() first."
      );
    }

    const { systemPrompt, userPrompt, repos, model, timeout } = options;

    const slug = repos[0]?.name ?? "unknown";
    const startTime = Date.now();
    let numTurns = 0;

    const { providerID, modelID } = parseModelString(model);
    debug(slug, "Parsed model:", { providerID, modelID });

    // Create a temp directory for the output file
    const tmpDir = await mkdtemp(join(tmpdir(), "onpush-"));
    const outputFile = join(tmpDir, `${slug}.md`);

    // Register MCP server with repo info and output path
    await this.registerMcpServer(repos, outputFile);

    const client = this.opencode.client;

    debug(slug, "Creating session");
    const session = await client.session.create({
      body: { title: `onpush-${slug}` },
    });
    const sessionId = session.data!.id;
    debug(slug, "Session created:", sessionId);

    // Track progress events
    const progressEvents: AgentProgressEvent[] = [];

    // Set up abort handling
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const abortSession = async () => {
      debug(slug, "Aborting session");
      try {
        await client.session.abort({ path: { id: sessionId } });
      } catch {
        /* best effort */
      }
    };

    if (timeout) {
      timeoutId = setTimeout(async () => {
        debug(slug, "Timeout reached, aborting session");
        await abortSession();
      }, timeout * 1000);
    }

    if (options.signal) {
      if (options.signal.aborted) {
        await abortSession();
      } else {
        options.signal.addEventListener("abort", () => abortSession(), {
          once: true,
        });
      }
    }

    // Propagate SIGINT
    const onSigint = async () => {
      debug(slug, "SIGINT received, aborting session");
      await abortSession();
    };
    process.once("SIGINT", onSigint);

    let savedContent: string | null = null;

    try {
      debug(
        slug,
        "Sending prompt with model:",
        providerID,
        modelID,
        "timeout:",
        timeout ? `${timeout}s` : "none"
      );

      // Send the prompt — the agent will use list_repos and save_document
      // tools from the registered MCP server
      const result = await client.session.prompt({
        path: { id: sessionId },
        body: {
          model: { providerID, modelID },
          parts: [
            {
              type: "text",
              text: `${systemPrompt}\n\n${userPrompt}`,
            },
          ],
        },
      });

      numTurns = 1;

      debug(slug, "Prompt completed");

      // Read the saved document from the temp file
      try {
        savedContent = await readFile(outputFile, "utf-8");
        debug(slug, "Read saved content, length:", savedContent.length);
      } catch {
        debug(slug, "No output file found, falling back to response text");
      }

      // Fallback: extract from response parts if save_document wasn't called
      if (!savedContent) {
        const parts = result.data?.parts as
          | Array<{ type: string; text?: string }>
          | undefined;
        if (parts) {
          const textParts = parts
            .filter((p) => p.type === "text" && p.text)
            .map((p) => p.text!)
            .join("");
          if (textParts) {
            savedContent = textParts;
            debug(slug, "Using response text as fallback, length:", textParts.length);
          }
        }
      }

      progressEvents.push({
        type: "text",
        message: (savedContent ?? "").slice(0, 100),
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      process.removeListener("SIGINT", onSigint);

      // Clean up session
      debug(slug, "Cleaning up session");
      try {
        await client.session.delete({ path: { id: sessionId } });
      } catch {
        /* best effort */
      }

      // Clean up temp directory
      try {
        await rm(tmpDir, { recursive: true });
      } catch {
        /* best effort */
      }
    }

    // Yield accumulated progress events
    for (const event of progressEvents) {
      yield event;
    }

    const content = savedContent ?? "";
    debug(slug, "Final content length:", content.length);

    return {
      content,
      // OpenCode does not expose cost or token data
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - startTime,
      numTurns,
    };
  }
}
