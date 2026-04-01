import type { DocumentType, OnPushConfig } from "../../core/document-types.js";
import type { ResolvedRepo } from "../../repos/manager.js";
import type { RepoChangeSet } from "../../repos/manager.js";

// Per-type prompt loaders
import { getPrompt as getProductOverview } from "./types/product-overview.js";
import { getPrompt as getArchitecture } from "./types/architecture.js";
import { getPrompt as getApiReference } from "./types/api-reference.js";
import { getPrompt as getBusinessOverview } from "./types/business-overview.js";
import { getPrompt as getSecurity } from "./types/security.js";
import { getPrompt as getTesting } from "./types/testing.js";
import { getPrompt as getDataModel } from "./types/data-model.js";
import { getPrompt as getDeployment } from "./types/deployment.js";
import { getPrompt as getKnownIssues } from "./types/known-issues.js";

const PROMPT_MAP: Record<string, () => string> = {
  "product-overview": getProductOverview,
  architecture: getArchitecture,
  "api-reference": getApiReference,
  "business-overview": getBusinessOverview,
  security: getSecurity,
  testing: getTesting,
  "data-model": getDataModel,
  deployment: getDeployment,
  "known-issues": getKnownIssues,
};

export interface PromptOptions {
  docType: DocumentType;
  config: OnPushConfig;
  repos: ResolvedRepo[];
  isIncremental: boolean;
  existingContent?: string;
  repoChanges?: RepoChangeSet[];
}

/**
 * Builds the complete system prompt for a document generation agent.
 */
export function buildSystemPrompt(options: PromptOptions): string {
  const { docType, config, repos, isIncremental, existingContent, repoChanges } =
    options;

  const sections: string[] = [];

  // Role definition
  sections.push(
    `You are a technical documentation expert generating the "${docType.name}" document for a software project called "${config.project.name}".${config.project.description ? ` ${config.project.description}` : ""}

You have access to tools for reading files, searching code, viewing git history, and fetching web resources.`
  );

  // Approach
  sections.push(`## Approach

1. Use your tools to explore the codebase thoroughly
2. Read relevant source files, configuration, and documentation
3. Analyze the code structure, patterns, and conventions
4. Generate comprehensive, accurate documentation

Start by listing the repository contents to understand the project structure, then read key files relevant to this document type.`);

  // Repository context
  if (repos.length === 1) {
    sections.push(
      `## Repository\n\nYou are documenting: **${repos[0].name}** at \`${repos[0].localPath}\``
    );
  } else {
    const repoList = repos
      .map((r) => `- **${r.name}** at \`${r.localPath}\``)
      .join("\n");
    sections.push(
      `## Repositories\n\nYou are documenting a multi-repository project. The following repositories are available:\n\n${repoList}\n\nExplore all relevant repositories for this document type.`
    );
  }

  // Output requirements
  sections.push(`## Output Requirements

- Write in clear, precise Markdown (GitHub Flavored Markdown)
- Structure with clear headings (H2 for sections, H3 for subsections)
- Reference specific files and code locations where helpful
- Be thorough but concise — no filler content
- Use tables, code blocks, and lists where appropriate
- Do NOT include YAML frontmatter — it will be added automatically`);

  if (config.output.toc) {
    sections.push(
      `- Include a table of contents at the beginning of the document after the main title`
    );
  }

  sections.push(
    `- Use Mermaid diagrams when they add value for visualizing architecture, data flow, or processes — but do not force diagrams where they don't help
- When writing Mermaid diagrams, ensure valid syntax: use correct diagram type keywords (graph, flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, pie, gitGraph), properly close all brackets and quotes, and use valid arrow syntax (-->, --->, -.->). The save_document tool validates Mermaid syntax — if it returns a validation error, fix the Mermaid syntax and call save_document again`
  );

  // Per-type instructions
  const typePromptFn = PROMPT_MAP[docType.slug];
  if (typePromptFn) {
    sections.push(typePromptFn());
  } else {
    // Custom type — use the description as guidance
    sections.push(
      `## Document Type: ${docType.name}\n\n${docType.description}`
    );
  }

  // Custom user prompt from config
  if (docType.prompt) {
    sections.push(
      `## Additional Instructions\n\n${docType.prompt}`
    );
  }

  // Incremental update context
  if (isIncremental && existingContent && repoChanges) {
    const changedRepos = repoChanges
      .filter((rc) => rc.hasChanges)
      .map(
        (rc) =>
          `- ${rc.repo.name}: ${rc.fromSha ?? "(new)"} → ${rc.toSha}`
      )
      .join("\n");

    sections.push(`## Incremental Update Mode

You are updating an existing document based on code changes.

Instructions:
- The existing document content is provided below
- Repositories with changes since last generation are noted
- Update ONLY sections affected by the code changes
- PRESERVE all content not affected by the changes
- Keep the same structure and formatting style
- Add new sections if the changes introduce new concepts
- Save the complete updated document via the \`save_document\` tool (not just the diff)

Repositories with changes:
${changedRepos}

Existing document:
\`\`\`markdown
${existingContent}
\`\`\``);
  }

  // Final instruction
  sections.push(
    `## Final Output

When you have finished writing the document, you MUST call the \`save_document\` tool with the complete Markdown content. Start the content with a level-1 heading (# ${docType.name}). Do not include YAML frontmatter — it will be added automatically.

IMPORTANT: Do NOT return the document as plain text in your response. Always use the \`save_document\` tool to submit the final document. Your conversational text is discarded — only content passed to \`save_document\` is saved.`
  );

  return sections.join("\n\n");
}

/**
 * Builds the system prompt for the incremental triage agent.
 * This agent analyzes diffs and decides which document types need updating.
 */
export function buildTriagePrompt(
  config: OnPushConfig,
  enabledTypes: DocumentType[],
  repoChanges: RepoChangeSet[]
): string {
  const typeList = enabledTypes
    .map((t) => `- ${t.slug}: ${t.name} — ${t.description}`)
    .join("\n");

  const changeList = repoChanges
    .filter((rc) => rc.hasChanges)
    .map(
      (rc) =>
        `- ${rc.repo.name}: ${rc.fromSha ?? "(new)"} → ${rc.toSha}`
    )
    .join("\n");

  return `You are analyzing code changes to determine which documentation types need to be updated.

## Project: ${config.project.name}

## Repositories with changes:
${changeList}

## Available document types:
${typeList}

## Task

Use git tools to examine the diffs in the changed repositories. Based on the nature of the changes, determine which document types need to be regenerated.

Return your answer as a JSON array of document type slugs. For example:
["architecture", "api-reference"]

Only include types that are genuinely affected by the changes. If a change only modifies test files, the API Reference probably doesn't need updating. If a change adds a new database migration, the Data Model doc likely needs updating.

Return ONLY the JSON array, nothing else.`;
}
