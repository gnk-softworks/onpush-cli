import { z } from "zod";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { ResolvedRepo } from "../../repos/manager.js";
import { validateDocumentForSave } from "../../validation/mermaid.js";

/**
 * Creates an MCP server with the onpush tools:
 * - list_repos: tells the agent which repositories are available
 * - save_document: captures the final markdown content from the agent
 *
 * The `onDocumentSaved` callback is called when the agent invokes save_document,
 * allowing us to capture clean document content without conversational noise.
 * Mermaid diagrams are validated before saving; on failure, the agent receives
 * error details and can fix the diagrams and retry.
 */
export function createOnPushServer(
  repos: ResolvedRepo[],
  onDocumentSaved: (content: string) => void
) {
  let saveAttempts = 0;
  const listReposTool = tool(
    "list_repos",
    "List all repositories available for analysis. Call this first to understand what repositories you can explore.",
    {},
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              repos.map((r) => ({
                name: r.name,
                path: r.localPath,
                type: r.type,
              })),
              null,
              2
            ),
          },
        ],
      };
    },
    { annotations: { readOnly: true } }
  );

  const saveDocumentTool = tool(
    "save_document",
    "Save the final generated documentation. Call this tool with the complete Markdown content when you are done writing the document. The content will be validated for Mermaid diagram syntax errors. If validation fails, you will receive error details — fix the issues and call save_document again. Do not return the document as plain text — always use this tool.",
    {
      content: z.string().describe(
        "The complete Markdown document content. Start with a level-1 heading. Do not include YAML frontmatter."
      ),
    },
    async (args) => {
      saveAttempts++;
      const validation = await validateDocumentForSave({
        content: args.content,
        attemptCount: saveAttempts,
      });

      if (!validation.accepted) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Document NOT saved — Mermaid diagram syntax errors found:\n\n${validation.errorMessage}\n\nPlease fix the Mermaid syntax and call save_document again.`,
            },
          ],
          isError: true,
        };
      }

      onDocumentSaved(args.content);
      return {
        content: [
          {
            type: "text" as const,
            text: "Document saved successfully.",
          },
        ],
      };
    }
  );

  return createSdkMcpServer({
    name: "onpush",
    version: "1.0.0",
    tools: [listReposTool, saveDocumentTool],
  });
}
