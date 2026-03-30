#!/usr/bin/env node
/**
 * Standalone MCP server that runs over stdio.
 * Exposes list_repos and save_document tools for use by OpenCode.
 *
 * Communication:
 * - Repos are passed via ONPUSH_REPOS env var (JSON array of {name, localPath, type})
 * - Saved document content is written to the file at ONPUSH_OUTPUT_FILE
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeFileSync } from "node:fs";

interface RepoInfo {
  name: string;
  localPath: string;
  type: string;
}

const repos: RepoInfo[] = JSON.parse(process.env.ONPUSH_REPOS ?? "[]");
const outputFile = process.env.ONPUSH_OUTPUT_FILE ?? "";

const server = new McpServer({
  name: "onpush",
  version: "1.0.0",
});

server.tool(
  "list_repos",
  "List all repositories available for analysis. Call this first to understand what repositories you can explore.",
  {},
  async () => ({
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
  })
);

server.tool(
  "save_document",
  "Save the final generated documentation. You MUST call this tool exactly once with the complete Markdown content when you are done writing the document. Do not return the document as plain text — always use this tool.",
  {
    content: z.string().describe(
      "The complete Markdown document content. Start with a level-1 heading. Do not include YAML frontmatter."
    ),
  },
  async (args) => {
    if (outputFile) {
      writeFileSync(outputFile, args.content, "utf-8");
    }
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

const transport = new StdioServerTransport();
await server.connect(transport);
