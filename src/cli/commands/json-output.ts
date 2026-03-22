import type { OrchestrationResult } from "../../generation/orchestrator.js";
import type { OnPushConfig } from "../../core/document-types.js";
import { slugify, type RepoChangeSet } from "../../repos/manager.js";

export interface JsonOutput {
  success: boolean;
  type: "full" | "incremental";
  model: string;
  repositories: Record<
    string,
    { fromSha?: string; toSha: string; changed: boolean }
  >;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  durationMs: number;
  documentsUpdated: string[];
  documentsSkipped: string[];
  documents: Array<{
    slug: string;
    name: string;
    status: string;
    version?: number;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    outputPath?: string;
    error?: string;
  }>;
  errors: string[];
}

export function formatJsonOutput(
  result: OrchestrationResult,
  config: OnPushConfig,
  repoChanges: RepoChangeSet[],
  outputPaths: Record<string, string>
): JsonOutput {
  const errors: string[] = [];
  const documentsUpdated: string[] = [];
  const documentsSkipped: string[] = [];

  for (const doc of result.documents) {
    if (doc.status === "generated" || doc.status === "updated") {
      documentsUpdated.push(doc.slug);
    } else if (doc.status === "skipped") {
      documentsSkipped.push(doc.slug);
    }
    if (doc.error) {
      errors.push(`${doc.slug}: ${doc.error}`);
    }
  }

  const repositories: JsonOutput["repositories"] = {};
  for (const rc of repoChanges) {
    const key = slugify(rc.repo.name);
    repositories[key] = {
      fromSha: rc.fromSha,
      toSha: rc.toSha,
      changed: rc.hasChanges,
    };
  }

  const hasFailed = result.documents.some((d) => d.status === "failed");

  return {
    success: !hasFailed,
    type: result.type,
    model: result.model,
    repositories,
    totalCostUsd: result.costSummary.totalCostUsd,
    totalInputTokens: result.costSummary.totalInputTokens,
    totalOutputTokens: result.costSummary.totalOutputTokens,
    durationMs: result.durationMs,
    documentsUpdated,
    documentsSkipped,
    documents: result.documents.map((d) => ({
      slug: d.slug,
      name: d.name,
      status: d.status,
      costUsd: d.costUsd,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
      durationMs: d.durationMs,
      outputPath: outputPaths[d.slug],
      error: d.error,
    })),
    errors,
  };
}
