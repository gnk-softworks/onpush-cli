import chalk from "chalk";
import type { CostSummary } from "../../generation/cost.js";

export interface ProgressRenderer {
  header(projectName: string, model: string): void;
  generationType(type: "full" | "incremental", changesInfo?: string): void;
  triageResult(affectedTypes: string[]): void;
  startDocument(index: number, total: number, name: string): void;
  finishDocument(
    name: string,
    status: "generated" | "updated" | "failed",
    durationMs: number,
    costUsd: number,
    error?: string
  ): void;
  skipDocument(name: string): void;
  costLimitExceeded(currentCost: number, limit: number): void;
  summary(
    docsGenerated: number,
    docsSkipped: number,
    docsFailed: number,
    costSummary: CostSummary,
    durationMs: number,
    outputDir: string
  ): void;
  error(message: string): void;
}

export function createProgressRenderer(options: {
  ci: boolean;
  quiet: boolean;
  verbose: boolean;
  provider?: string;
}): ProgressRenderer {
  const showCost = options.provider !== "copilot";
  if (options.quiet) {
    return createQuietRenderer();
  }
  if (options.ci || !process.stdout.isTTY) {
    return createCiRenderer(showCost);
  }
  return createTtyRenderer(options.verbose, showCost);
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface DocLine {
  index: number;
  total: number;
  name: string;
  status: "in_progress" | "generated" | "updated" | "failed";
  durationMs?: number;
  costUsd?: number;
}

function createTtyRenderer(verbose: boolean, showCost: boolean): ProgressRenderer {
  const docs = new Map<string, DocLine>();

  return {
    header(projectName: string, model: string) {
      console.log();
      console.log(
        `  ${chalk.bold("OnPush")} — Generating documentation for ${chalk.cyan(projectName)}`
      );
      console.log(`  Model: ${chalk.dim(model)}`);
      console.log();
    },

    generationType(type: "full" | "incremental", changesInfo?: string) {
      if (type === "incremental" && changesInfo) {
        console.log(`  ${chalk.dim(changesInfo)}`);
        console.log();
      }
    },

    triageResult(affectedTypes: string[]) {
      if (verbose) {
        console.log(
          `  Agent analyzing changes...\n  Affected document types: ${chalk.cyan(affectedTypes.join(", "))}`
        );
        console.log();
      }
    },

    startDocument(index: number, total: number, name: string) {
      docs.set(name, { index, total, name, status: "in_progress" });
      console.log(`  [${index + 1}/${total}] ${name} ${chalk.cyan("generating...")}`);
    },

    finishDocument(
      name: string,
      status: "generated" | "updated" | "failed",
      durationMs: number,
      costUsd: number,
      error?: string
    ) {
      const doc = docs.get(name);
      if (doc) {
        doc.status = status;
        doc.durationMs = durationMs;
        doc.costUsd = costUsd;

        const prefix = `  [${doc.index + 1}/${doc.total}] ${doc.name} `;
        const duration = (durationMs / 1000).toFixed(1);
        if (status === "failed") {
          console.log(`${prefix}${chalk.red("✖ failed")}`);
        } else {
          const meta = showCost
            ? `(${duration}s, $${costUsd.toFixed(4)})`
            : `(${duration}s)`;
          console.log(`${prefix}${chalk.green(`✔ ${status}`)} ${chalk.dim(meta)}`);
        }
        if (error) {
          console.log(chalk.red(`    Error: ${error}`));
        }
        docs.delete(name);
      }
    },

    skipDocument(name: string) {
      console.log(`  ${chalk.dim(`${name} — unchanged, skipped`)}`);
    },

    costLimitExceeded(currentCost: number, limit: number) {
      console.log();
      console.log(
        chalk.yellow(
          `  Cost limit exceeded: $${currentCost.toFixed(4)} > $${limit.toFixed(4)}`
        )
      );
      console.log(chalk.yellow(`  Remaining documents skipped.`));
    },

    summary(
      docsGenerated: number,
      docsSkipped: number,
      docsFailed: number,
      costSummary: CostSummary,
      durationMs: number,
      outputDir: string
    ) {
      const duration = (durationMs / 1000).toFixed(1);

      console.log();
      const parts: string[] = [];
      if (docsGenerated > 0)
        parts.push(`${docsGenerated} document${docsGenerated > 1 ? "s" : ""} generated`);
      if (docsSkipped > 0)
        parts.push(`${docsSkipped} unchanged`);
      if (docsFailed > 0) parts.push(chalk.red(`${docsFailed} failed`));

      console.log(`  ${parts.join(", ")} in ${duration}s`);
      if (showCost) {
        const tokenSummary = `${(costSummary.totalInputTokens / 1000).toFixed(1)}K in / ${(costSummary.totalOutputTokens / 1000).toFixed(1)}K out`;
        console.log(
          `  Total cost: ${chalk.bold(`$${costSummary.totalCostUsd.toFixed(4)}`)} | Tokens: ${tokenSummary}`
        );
      }
      console.log(`  Output: ${chalk.cyan(outputDir)}`);
      console.log();
    },

    error(message: string) {
      console.error(chalk.red(`  Error: ${message}`));
    },
  };
}

function createCiRenderer(showCost: boolean): ProgressRenderer {
  return {
    header(projectName: string, model: string) {
      console.log(`[onpush] Generating documentation for ${projectName}`);
      console.log(`[onpush] Model: ${model}`);
    },
    generationType(type: string) {
      console.log(`[onpush] Generation type: ${type}`);
    },
    triageResult(affectedTypes: string[]) {
      console.log(
        `[onpush] Affected types: ${affectedTypes.join(", ")}`
      );
    },
    startDocument(index: number, total: number, name: string) {
      console.log(`[onpush] [${index + 1}/${total}] Generating ${name}...`);
    },
    finishDocument(
      name: string,
      status: string,
      durationMs: number,
      costUsd: number,
      error?: string
    ) {
      const meta = showCost
        ? `(${(durationMs / 1000).toFixed(1)}s, $${costUsd.toFixed(4)})`
        : `(${(durationMs / 1000).toFixed(1)}s)`;
      console.log(`[onpush] ${name}: ${status} ${meta}`);
      if (error) {
        console.log(`[onpush] ERROR: ${name}: ${error}`);
      }
    },
    skipDocument(name: string) {
      console.log(`[onpush] ${name}: skipped (unchanged)`);
    },
    costLimitExceeded(currentCost: number, limit: number) {
      console.log(
        `[onpush] WARNING: Cost limit exceeded ($${currentCost.toFixed(4)} > $${limit.toFixed(4)})`
      );
    },
    summary(
      docsGenerated: number,
      docsSkipped: number,
      docsFailed: number,
      costSummary: CostSummary,
      durationMs: number,
    ) {
      console.log(
        `[onpush] Done: ${docsGenerated} generated, ${docsSkipped} skipped, ${docsFailed} failed`
      );
      if (showCost) {
        console.log(
          `[onpush] Cost: $${costSummary.totalCostUsd.toFixed(4)} | Duration: ${(durationMs / 1000).toFixed(1)}s`
        );
      } else {
        console.log(`[onpush] Duration: ${(durationMs / 1000).toFixed(1)}s`);
      }
    },
    error(message: string) {
      console.error(`[onpush] ERROR: ${message}`);
    },
  };
}

function createQuietRenderer(): ProgressRenderer {
  return {
    header() {},
    generationType() {},
    triageResult() {},
    startDocument() {},
    finishDocument() {},
    skipDocument() {},
    costLimitExceeded() {},
    summary() {},
    error(message: string) {
      console.error(message);
    },
  };
}
