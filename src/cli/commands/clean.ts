import type { Command } from "commander";
import chalk from "chalk";
import { readdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadConfig, resolveConfigPath, getConfigDir } from "../../core/config.js";

export function registerCleanCommand(program: Command): void {
  program
    .command("clean")
    .description("Remove all generated docs and state")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      try {
        const configPath = resolveConfigPath(globalOpts.config);
        const config = await loadConfig(globalOpts.config);
        const configDir = getConfigDir(configPath);

        const outputDir = resolve(
          configDir,
          "..",
          config.output.directory
        );

        // Remove generated docs
        let removedCount = 0;
        try {
          const files = await readdir(outputDir, { recursive: true });
          for (const file of files) {
            if (String(file).endsWith(".md")) {
              await unlink(join(outputDir, String(file)));
              removedCount++;
            }
          }
        } catch {
          // Output directory doesn't exist
        }

        // Remove state file
        const statePath = join(configDir, "state.json");
        let stateRemoved = false;
        try {
          await unlink(statePath);
          stateRemoved = true;
        } catch {
          // State file doesn't exist
        }

        console.log();
        if (removedCount > 0) {
          console.log(
            `  Removed ${removedCount} file${removedCount > 1 ? "s" : ""} from ${config.output.directory}`
          );
        }
        if (stateRemoved) {
          console.log(`  Removed .onpush/state.json`);
        }
        console.log(`  Config preserved at .onpush/config.yml`);
        console.log();
      } catch (err: unknown) {
        console.error(chalk.red(`  Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });
}
