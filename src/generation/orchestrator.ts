import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { OnPushConfig, DocumentType } from "../core/document-types.js";
import type { OnPushState } from "../core/state.js";
import type { ResolvedRepo, RepoChangeSet } from "../repos/manager.js";
import type { AuthResult } from "../core/auth.js";
import { CostTracker } from "./cost.js";
import { buildSystemPrompt, buildTriagePrompt } from "./prompts/system.js";
import type { AgentProgressEvent, AgentResult, ByokConfig } from "./agent.js";
import type { DocAgentProvider } from "./providers/types.js";

interface TriageResult {
  slugs: string[];
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export interface OrchestrationOptions {
  config: OnPushConfig;
  state: OnPushState | null;
  repos: ResolvedRepo[];
  repoChanges: RepoChangeSet[];
  types: DocumentType[];
  auth: AuthResult;
  provider: DocAgentProvider;
  byok?: ByokConfig;
  outputDir: string;
  parallel: number;
  costLimit: number | null;
  full: boolean;
  singleType?: string;
  verbose: boolean;
}

export interface DocumentResult {
  slug: string;
  name: string;
  status: "generated" | "updated" | "skipped" | "failed";
  content?: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  error?: string;
}

export interface OrchestrationResult {
  type: "full" | "incremental";
  model: string;
  documents: DocumentResult[];
  costSummary: ReturnType<CostTracker["getSummary"]>;
  durationMs: number;
}

export type OrchestrationEvent =
  | { type: "start"; total: number; generationType: "full" | "incremental" }
  | { type: "triage"; affectedTypes: string[] }
  | { type: "doc_start"; index: number; total: number; slug: string; name: string }
  | { type: "doc_progress"; slug: string; event: AgentProgressEvent }
  | {
      type: "doc_done";
      slug: string;
      name: string;
      status: "generated" | "updated" | "failed";
      durationMs: number;
      costUsd: number;
      error?: string;
    }
  | { type: "doc_skipped"; slug: string; name: string }
  | { type: "cost_limit_exceeded"; currentCost: number; limit: number };

/**
 * Orchestrates the documentation generation pipeline.
 * Yields events for UI progress reporting.
 */
export async function* orchestrate(
  options: OrchestrationOptions
): AsyncGenerator<OrchestrationEvent, OrchestrationResult> {
  const {
    config,
    state,
    repos,
    repoChanges,
    types,
    auth,
    parallel,
    costLimit,
    full,
    singleType,
  } = options;

  const startTime = Date.now();
  const costTracker = new CostTracker();
  const isIncremental = !full && state !== null;

  // Filter to single type if requested
  let typesToGenerate = singleType
    ? types.filter((t) => t.slug === singleType)
    : types;

  if (singleType && typesToGenerate.length === 0) {
    throw new Error(`Unknown document type: ${singleType}`);
  }

  // Determine which types need updating
  let affectedSlugs: string[] | null = null;

  if (isIncremental && !singleType) {
    const anyChanges = repoChanges.some((rc) => rc.hasChanges);
    if (!anyChanges) {
      // No changes — skip all
      yield {
        type: "start",
        total: 0,
        generationType: "incremental",
      };
      for (const t of typesToGenerate) {
        yield { type: "doc_skipped", slug: t.slug, name: t.name };
      }
      return {
        type: "incremental",
        model: config.generation.model,
        documents: typesToGenerate.map((t) => ({
          slug: t.slug,
          name: t.name,
          status: "skipped" as const,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          durationMs: 0,
        })),
        costSummary: costTracker.getSummary(),
        durationMs: Date.now() - startTime,
      };
    }

    // Run triage agent to determine affected types
    const triageResult = await runTriageAgent(
      config,
      typesToGenerate,
      repoChanges,
      repos,
      auth,
      options.provider,
      options.byok,
      options.verbose
    );
    affectedSlugs = triageResult.slugs;
    costTracker.addDocumentCost({
      slug: "__triage__",
      costUsd: triageResult.costUsd,
      inputTokens: triageResult.inputTokens,
      outputTokens: triageResult.outputTokens,
      durationMs: triageResult.durationMs,
    });
    yield { type: "triage", affectedTypes: affectedSlugs };

    typesToGenerate = typesToGenerate.filter((t) =>
      affectedSlugs!.includes(t.slug)
    );
  }

  const generationType = isIncremental ? "incremental" : "full";
  yield { type: "start", total: typesToGenerate.length, generationType };

  const results: DocumentResult[] = [];
  const skippedTypes = types.filter(
    (t) => !typesToGenerate.find((g) => g.slug === t.slug)
  );

  // Emit skipped events
  for (const t of skippedTypes) {
    yield { type: "doc_skipped", slug: t.slug, name: t.name };
    results.push({
      slug: t.slug,
      name: t.name,
      status: "skipped",
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
    });
  }

  // Abort controller to cancel in-flight agents when cost limit is exceeded
  const costAbortController = new AbortController();

  // Generate documents (sequential or parallel)
  if (parallel <= 1) {
    // Sequential generation
    for (let i = 0; i < typesToGenerate.length; i++) {
      const docType = typesToGenerate[i];
      yield {
        type: "doc_start",
        index: i,
        total: typesToGenerate.length,
        slug: docType.slug,
        name: docType.name,
      };

      const result = await generateDocument(
        docType,
        options,
        isIncremental,
        costAbortController.signal,
        typesToGenerate.length - i
      );

      results.push(result);

      if (result.status !== "failed") {
        costTracker.addDocumentCost({
          slug: result.slug,
          costUsd: result.costUsd,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          durationMs: result.durationMs,
        });
      }

      yield {
        type: "doc_done",
        slug: result.slug,
        name: result.name,
        status: result.status as "generated" | "updated" | "failed",
        durationMs: result.durationMs,
        costUsd: result.costUsd,
        error: result.error,
      };

      // Check cost limit after each document
      if (costTracker.isOverLimit(costLimit)) {
        costAbortController.abort();
        yield {
          type: "cost_limit_exceeded",
          currentCost: costTracker.getTotalCost(),
          limit: costLimit!,
        };
        // Mark remaining docs as skipped
        for (let j = i + 1; j < typesToGenerate.length; j++) {
          results.push({
            slug: typesToGenerate[j].slug,
            name: typesToGenerate[j].name,
            status: "skipped",
            costUsd: 0,
            inputTokens: 0,
            outputTokens: 0,
            durationMs: 0,
          });
        }
        break;
      }
    }
  } else {
    // Parallel generation with concurrency limiter
    const queue = [...typesToGenerate];
    const running = new Map<string, Promise<DocumentResult>>();

    let index = 0;
    while (queue.length > 0 || running.size > 0) {
      // Fill up to parallel limit (check cost before launching new tasks)
      while (queue.length > 0 && running.size < parallel) {
        if (costTracker.isOverLimit(costLimit)) break;
        const docType = queue.shift()!;
        const currentIndex = index++;

        yield {
          type: "doc_start",
          index: currentIndex,
          total: typesToGenerate.length,
          slug: docType.slug,
          name: docType.name,
        };

        const promise = generateDocument(
          docType,
          options,
          isIncremental,
          costAbortController.signal,
          queue.length + running.size + 1
        );
        running.set(docType.slug, promise);
      }

      // Wait for any to complete
      if (running.size > 0) {
        const entries = [...running.entries()];
        const settled = await Promise.race(
          entries.map(([slug, promise]) =>
            promise.then((result) => ({ slug, result }))
          )
        );

        running.delete(settled.slug);
        results.push(settled.result);

        if (settled.result.status !== "failed") {
          costTracker.addDocumentCost({
            slug: settled.result.slug,
            costUsd: settled.result.costUsd,
            inputTokens: settled.result.inputTokens,
            outputTokens: settled.result.outputTokens,
            durationMs: settled.result.durationMs,
          });
        }

        yield {
          type: "doc_done",
          slug: settled.result.slug,
          name: settled.result.name,
          status: settled.result.status as "generated" | "updated" | "failed",
          durationMs: settled.result.durationMs,
          costUsd: settled.result.costUsd,
          error: settled.result.error,
        };

        if (costTracker.isOverLimit(costLimit)) {
          costAbortController.abort();
          yield {
            type: "cost_limit_exceeded",
            currentCost: costTracker.getTotalCost(),
            limit: costLimit!,
          };

          // Await all in-flight promises so they don't leak
          const inFlight = await Promise.allSettled(
            [...running.entries()].map(([slug, promise]) =>
              promise.then((result) => ({ slug, result }))
            )
          );
          for (const settled of inFlight) {
            if (settled.status === "fulfilled") {
              results.push(settled.value.result);
              yield {
                type: "doc_done",
                slug: settled.value.result.slug,
                name: settled.value.result.name,
                status: settled.value.result.status as "generated" | "updated" | "failed",
                durationMs: settled.value.result.durationMs,
                costUsd: settled.value.result.costUsd,
                error: settled.value.result.error,
              };
            }
          }

          // Mark remaining queued docs as skipped
          for (const docType of queue) {
            results.push({
              slug: docType.slug,
              name: docType.name,
              status: "skipped",
              costUsd: 0,
              inputTokens: 0,
              outputTokens: 0,
              durationMs: 0,
            });
          }
          break;
        }
      }
    }
  }

  return {
    type: generationType,
    model: config.generation.model,
    documents: results,
    costSummary: costTracker.getSummary(),
    durationMs: Date.now() - startTime,
  };
}

const MAX_RETRIES = 1;
const RETRY_BACKOFF_MS = 2000;

/**
 * Generates a single document using the agent, with one retry on failure.
 */
async function generateDocument(
  docType: DocumentType,
  options: OrchestrationOptions,
  isIncremental: boolean,
  signal?: AbortSignal,
  remainingDocs: number = 1
): Promise<DocumentResult> {
  const { config, repos, repoChanges, auth, outputDir } = options;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Read existing document content for incremental updates
      let existingContent: string | undefined;
      if (isIncremental) {
        const filename = config.output.filename_template.replace(
          "{slug}",
          docType.slug
        );
        const filePath = join(outputDir, filename);
        try {
          const raw = await readFile(filePath, "utf-8");
          // Strip frontmatter
          const match = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
          existingContent = match ? match[1].trim() : raw;
        } catch {
          // File doesn't exist — treat as full generation for this type
        }
      }

      const systemPrompt = buildSystemPrompt({
        docType,
        config,
        repos,
        isIncremental: isIncremental && existingContent !== undefined,
        existingContent,
        repoChanges,
      });

      const model = docType.model ?? config.generation.model;
      const userPrompt = `Generate the "${docType.name}" documentation for ${config.project.name}.`;

      const generator = options.provider.runDocAgent({
        systemPrompt,
        userPrompt,
        repos,
        model,
        auth,
        byok: options.byok,
        maxTurns: 50,
        maxBudgetUsd: options.costLimit
          ? (options.costLimit * 0.9) / remainingDocs
          : undefined,
        timeout: config.generation.timeout,
        signal,
      });

      // Consume the generator
      let agentResult: Awaited<ReturnType<typeof generator.next>>;
      do {
        agentResult = await generator.next();
      } while (!agentResult.done);

      const result = agentResult.value;

      return {
        slug: docType.slug,
        name: docType.name,
        status: isIncremental ? "updated" : "generated",
        content: result.content,
        costUsd: result.costUsd,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: result.durationMs,
      };
    } catch (err: unknown) {
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_BACKOFF_MS * (attempt + 1))
        );
        continue;
      }
      return {
        slug: docType.slug,
        name: docType.name,
        status: "failed",
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - startTime,
        error: (err as Error).message,
      };
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error("Unexpected: retry loop exited without returning");
}

/**
 * Runs a lightweight triage agent to determine which document types need updating.
 */
async function runTriageAgent(
  config: OnPushConfig,
  types: DocumentType[],
  repoChanges: RepoChangeSet[],
  repos: ResolvedRepo[],
  auth: AuthResult,
  provider: DocAgentProvider,
  byok: ByokConfig | undefined,
  verbose: boolean
): Promise<TriageResult> {
  const systemPrompt = buildTriagePrompt(config, types, repoChanges);
  const allSlugs = types.map((t) => t.slug);

  const emptyCost = { costUsd: 0, inputTokens: 0, outputTokens: 0, durationMs: 0 };

  try {
    const generator = provider.runDocAgent({
      systemPrompt,
      userPrompt:
        "Analyze the git diffs and determine which document types need updating. Return a JSON array of slugs.",
      repos,
      model: config.generation.model,
      auth,
      byok,
      maxTurns: 20,
    });

    let result: Awaited<ReturnType<typeof generator.next>>;
    do {
      result = await generator.next();
    } while (!result.done);

    const agentResult: AgentResult = result.value;
    const content = agentResult.content.trim();
    const cost = {
      costUsd: agentResult.costUsd,
      inputTokens: agentResult.inputTokens,
      outputTokens: agentResult.outputTokens,
      durationMs: agentResult.durationMs,
    };

    // Parse JSON array from response
    const match = content.match(/\[[\s\S]*\]/g)?.at(-1);
    if (match) {
      const slugs = JSON.parse(match) as string[];
      return {
        slugs: slugs.filter((s) => types.some((t) => t.slug === s)),
        ...cost,
      };
    }

    // If parsing fails, regenerate all types
    if (verbose) {
      console.error(`  [triage] Could not parse JSON from triage response, falling back to full regeneration`);
    }
    return { slugs: allSlugs, ...cost };
  } catch (err: unknown) {
    // On triage failure, regenerate all types
    if (verbose) {
      console.error(`  [triage] Triage agent failed: ${(err as Error).message}, falling back to full regeneration`);
    }
    return { slugs: allSlugs, ...emptyCost };
  }
}
