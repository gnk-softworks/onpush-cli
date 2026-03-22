import type { Command } from "commander";
import chalk from "chalk";
import { resolveConfigPath, getConfigDir } from "../../core/config.js";
import { loadState } from "../../core/state.js";

export function registerCostCommand(program: Command): void {
  program
    .command("cost")
    .description("Show historical cost data from generation state")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      try {
        const configPath = resolveConfigPath(globalOpts.config);
        const configDir = getConfigDir(configPath);
        const state = await loadState(configDir);

        if (!state || state.history.length === 0) {
          console.log();
          console.log(`  No generation history found.`);
          console.log(`  Run 'onpush generate' to generate documentation.`);
          console.log();
          return;
        }

        console.log();
        console.log(`  ${chalk.bold("Generation history (last 10):")}`);

        const recent = state.history.slice(0, 10);
        for (const entry of recent) {
          const date = new Date(entry.timestamp).toLocaleDateString();
          const docsCount = entry.documentsUpdated.length;
          const cost = `$${entry.totalCostUsd.toFixed(4)}`;
          const inputTokens = entry.totalInputTokens ?? 0;
          const outputTokens = entry.totalOutputTokens ?? 0;
          const tokens = `${((inputTokens + outputTokens) / 1000).toFixed(1)}K tokens`;

          console.log(
            `    ${chalk.dim(date)}  ${entry.type.padEnd(12)}  ${docsCount} docs  ${chalk.bold(cost)}  ${chalk.dim(tokens)}`
          );
        }

        const totalCost = state.history.reduce(
          (sum, e) => sum + e.totalCostUsd,
          0
        );
        console.log();
        console.log(
          `  Total: ${chalk.bold(`$${totalCost.toFixed(4)}`)} across ${state.history.length} generation${state.history.length > 1 ? "s" : ""}`
        );
        console.log();
      } catch (err: unknown) {
        console.error(chalk.red(`  Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });
}
