import type { Command } from "commander";
import { resolve } from "node:path";
import { loadConfig, resolveConfigPath, getConfigDir } from "../../core/config.js";
import { loadState, saveState, createInitialState, updateDocumentState, appendHistory } from "../../core/state.js";
import { resolveEnabledTypes } from "../../core/document-types.js";
import { resolveAuthForProvider } from "../../core/auth.js";
import { resolveEnvOverrides } from "../../core/env.js";
import type { ByokConfig } from "../../generation/agent.js";
import { createProvider } from "../../generation/providers/index.js";
import type { DocAgentProvider } from "../../generation/providers/types.js";
import { ExitCode, ConfigError, AuthError, CostLimitError } from "../../core/errors.js";
import { resolveRepos, syncRepos, getRepoChanges, slugify } from "../../repos/manager.js";
import { orchestrate, type OrchestrationEvent } from "../../generation/orchestrator.js";
import { writeDocument, ensureOutputDir } from "../../output/writer.js";
import { mergeDocuments } from "../../output/merger.js";
import { createProgressRenderer } from "../ui/progress.js";
import { formatJsonOutput } from "./json-output.js";

export function registerGenerateCommand(program: Command): void {
  program
    .command("generate")
    .description("Generate or update documentation using AI")
    .option("--full", "Force full regeneration (ignore incremental)")
    .option("--type <slug>", "Generate only a specific document type")
    .option("--single-file", "Merge all docs into a single file")
    .option("--model <model>", "Override AI model")
    .option(
      "--parallel <n>",
      "Run N document generations concurrently (default: from config)"
    )
    .option("--output <dir>", "Override output directory")
.option("--verbose", "Show detailed generation progress")
    .option("--json", "Output structured JSON summary to stdout")
    .option("--cost-limit <usd>", "Abort if actual cost exceeds threshold")
    .option("--provider <name>", "Override AI provider (anthropic, copilot, or opencode)")
    .option("--byok-type <type>", "BYOK provider type: openai, azure, or anthropic (Copilot only)")
    .option("--byok-base-url <url>", "BYOK base URL for the LLM API (Copilot only)")
    .option("--byok-api-key <key>", "BYOK API key for the LLM provider (Copilot only)")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const envOverrides = resolveEnvOverrides();
      const isCi = globalOpts.ci || envOverrides.ci;
      const isJson = opts.json || isCi;

      let progress = createProgressRenderer({
        ci: isCi,
        quiet: globalOpts.quiet,
        verbose: opts.verbose,
      });

      let agentProvider: DocAgentProvider | undefined;
      let exitCode = ExitCode.Success;

      try {
        // 1. Load config
        const configPath = resolveConfigPath(globalOpts.config);
        const config = await loadConfig(globalOpts.config);
        const configDir = getConfigDir(configPath);

        // Apply overrides
        const provider = opts.provider ?? envOverrides.provider ?? config.generation.provider;

        // Re-create renderer now that we know the provider (hides cost for copilot)
        progress = createProgressRenderer({
          ci: isCi,
          quiet: globalOpts.quiet,
          verbose: opts.verbose,
          provider,
        });
        if (opts.model || envOverrides.model) {
          config.generation.model = opts.model ?? envOverrides.model ?? config.generation.model;
        }

        let costLimit: number | null;
        if (opts.costLimit) {
          const parsed = parseFloat(opts.costLimit);
          if (isNaN(parsed)) {
            throw new ConfigError(`Invalid --cost-limit value: "${opts.costLimit}"`);
          }
          costLimit = parsed;
        } else {
          costLimit = envOverrides.costLimit ?? config.generation.cost_limit;
        }

        // 2. Resolve auth
        const auth = resolveAuthForProvider(provider, {
          apiKeyFlag: globalOpts.anthropicApiKey,
          githubTokenFlag: globalOpts.githubToken,
        });

        // 2b. Create AI provider
        agentProvider = await createProvider(provider);
        if ("setAuth" in agentProvider && typeof agentProvider.setAuth === "function") {
          agentProvider.setAuth(auth);
        }
        if (agentProvider.initialize) {
          await agentProvider.initialize();
        }

        // 2c. Resolve BYOK config (flags > env > config, Copilot only)
        let byok: ByokConfig | undefined;
        if (provider !== "copilot" && (opts.byokType || opts.byokBaseUrl || opts.byokApiKey)) {
          throw new ConfigError("--byok-* flags are only supported with the Copilot provider (--provider copilot)");
        }
        if (provider === "copilot") {
          const byokType = opts.byokType ?? envOverrides.byok?.type ?? config.generation.copilot_byok?.type;
          const byokBaseUrl = opts.byokBaseUrl ?? envOverrides.byok?.baseUrl ?? config.generation.copilot_byok?.base_url;
          const byokApiKey = opts.byokApiKey ?? envOverrides.byok?.apiKey ?? config.generation.copilot_byok?.api_key;
          if (byokType && byokBaseUrl) {
            byok = {
              type: byokType as ByokConfig["type"],
              baseUrl: byokBaseUrl,
              apiKey: byokApiKey,
            };
          }
        }

        // 3. Load state
        let state = await loadState(configDir);

        // 4. Resolve repos
        let repos = await resolveRepos(config, configPath);

        // 5. Sync remote repos
        repos = await syncRepos(config, repos, configPath);

        // 6. Get repo changes
        const repoChanges = getRepoChanges(repos, state);

        // 7. Resolve types
        const types = resolveEnabledTypes(config);

        // 8. Determine output dir
        const outputDir = resolve(
          configDir,
          "..",
          opts.output ?? envOverrides.outputDir ?? config.output.directory
        );
        await ensureOutputDir(outputDir);

        // Also add output dir to exclude patterns if not already there
        const outputRelative = config.output.directory.endsWith("/")
          ? config.output.directory
          : config.output.directory + "/";
        if (!config.exclude.includes(`${outputRelative}**`)) {
          config.exclude.push(`${outputRelative}**`);
        }

        // 9. Show header
        progress.header(config.project.name, config.generation.model);

        const isFullGeneration = opts.full || state === null;
        if (!isFullGeneration) {
          const changesInfo = repoChanges.some((rc) => rc.hasChanges)
            ? `Changes detected in ${repoChanges.filter((rc) => rc.hasChanges).length} repository(ies)`
            : "No changes detected";
          progress.generationType("incremental", changesInfo);
        } else {
          progress.generationType("full");
        }

        // 10. Orchestrate generation
        const generator = orchestrate({
          config,
          state,
          repos,
          repoChanges,
          types,
          auth,
          provider: agentProvider,
          byok,
          outputDir,
          parallel: opts.parallel ? (() => {
            const n = parseInt(opts.parallel, 10);
            if (isNaN(n) || n < 1) {
              throw new ConfigError(`Invalid --parallel value: "${opts.parallel}" (must be a positive integer)`);
            }
            return n;
          })() : config.generation.parallel,
          costLimit,
          full: opts.full ?? false,
          singleType: opts.type,
          verbose: opts.verbose ?? false,
        });

        const outputPaths: Record<string, string> = {};

        // Process events from the orchestrator
        let event = await generator.next();
        while (!event.done) {
          const ev = event.value as OrchestrationEvent;

          switch (ev.type) {
            case "start":
              break;
            case "triage":
              progress.triageResult(ev.affectedTypes);
              break;
            case "doc_start":
              progress.startDocument(ev.index, ev.total, ev.name);
              break;
            case "doc_progress":
              // Progress events are informational; no UI action needed
              break;
            case "doc_done":
              progress.finishDocument(
                ev.name,
                ev.status,
                ev.durationMs,
                ev.costUsd,
                ev.error
              );
              break;
            case "doc_skipped":
              progress.skipDocument(ev.name);
              break;
            case "cost_limit_exceeded":
              progress.costLimitExceeded(ev.currentCost, ev.limit);
              exitCode = ExitCode.CostLimitExceeded;
              break;
          }

          event = await generator.next();
        }

        const orchestrationResult = event.value;

        // 11. Write output files
        if (!state) {
          state = createInitialState(config.mode);
        }

        const now = new Date().toISOString();
        const documentsUpdated: string[] = [];

        for (const doc of orchestrationResult.documents) {
          if (doc.content && (doc.status === "generated" || doc.status === "updated")) {
            updateDocumentState(state, doc.slug, {
              costUsd: doc.costUsd,
              inputTokens: doc.inputTokens,
              outputTokens: doc.outputTokens,
            });

            const path = await writeDocument(
              outputDir,
              doc.slug,
              doc.content,
              {
                title: doc.name,
                generatedAt: now,
                version: state.documents[doc.slug].version,
                model: orchestrationResult.model,
              },
              config.output.filename_template
            );
            outputPaths[doc.slug] = path;
            documentsUpdated.push(doc.slug);
          }

          if (doc.status === "failed") {
            exitCode =
              exitCode === ExitCode.Success
                ? ExitCode.PartialFailure
                : exitCode;
          }
        }

        // 12. Optional single-file merge
        if (opts.singleFile) {
          const docsToMerge = orchestrationResult.documents
            .filter((d) => d.content)
            .map((d) => ({
              slug: d.slug,
              name: d.name,
              content: d.content!,
            }));

          if (docsToMerge.length > 0) {
            const merged = mergeDocuments(docsToMerge, orchestrationResult.model);
            const { writeFile } = await import("node:fs/promises");
            const { join } = await import("node:path");
            await writeFile(
              join(outputDir, "complete-documentation.md"),
              merged,
              "utf-8"
            );
          }
        }

        // 13. Update state
        for (const repo of repos) {
          state.repositories[slugify(repo.name)] = {
            lastCommitSha: repo.headSha,
            lastAnalyzedAt: now,
          };
        }

        state.lastGeneration = {
          timestamp: now,
          type: orchestrationResult.type,
          model: orchestrationResult.model,
          totalCostUsd: orchestrationResult.costSummary.totalCostUsd,
          totalInputTokens: orchestrationResult.costSummary.totalInputTokens,
          totalOutputTokens: orchestrationResult.costSummary.totalOutputTokens,
          durationMs: orchestrationResult.durationMs,
        };

        appendHistory(state, {
          timestamp: now,
          type: orchestrationResult.type,
          documentsUpdated,
          totalCostUsd: orchestrationResult.costSummary.totalCostUsd,
          totalInputTokens: orchestrationResult.costSummary.totalInputTokens,
          totalOutputTokens: orchestrationResult.costSummary.totalOutputTokens,
          durationMs: orchestrationResult.durationMs,
        });

        await saveState(configDir, state);

        // 14. Output
        const docsGenerated = orchestrationResult.documents.filter(
          (d) => d.status === "generated" || d.status === "updated"
        ).length;
        const docsSkipped = orchestrationResult.documents.filter(
          (d) => d.status === "skipped"
        ).length;
        const docsFailed = orchestrationResult.documents.filter(
          (d) => d.status === "failed"
        ).length;

        if (isJson) {
          const jsonOutput = formatJsonOutput(
            orchestrationResult,
            config,
            repoChanges,
            outputPaths
          );
          console.log(JSON.stringify(jsonOutput, null, 2));
        } else {
          progress.summary(
            docsGenerated,
            docsSkipped,
            docsFailed,
            orchestrationResult.costSummary,
            orchestrationResult.durationMs,
            outputDir
          );
        }
      } catch (err: unknown) {
        if (err instanceof ConfigError) {
          progress.error(err.message);
          exitCode = ExitCode.Fatal;
        } else if (err instanceof AuthError) {
          progress.error(err.message);
          exitCode = ExitCode.Fatal;
        } else if (err instanceof CostLimitError) {
          progress.error(err.message);
          exitCode = ExitCode.CostLimitExceeded;
        } else {
          progress.error((err as Error).message);
          exitCode = ExitCode.Fatal;
        }
      } finally {
        if (agentProvider?.shutdown) {
          await agentProvider.shutdown();
        }
      }

      process.exitCode = exitCode;
    });
}
