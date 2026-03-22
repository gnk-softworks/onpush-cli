import type { Command } from "commander";
import * as p from "@clack/prompts";
import { readdir, unlink, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resolveConfigPath, getConfigDir, loadConfig } from "../../core/config.js";

export function registerDeinitCommand(program: Command): void {
  program
    .command("deinit")
    .description("Remove OnPush configuration and generated docs")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isCi =
        globalOpts.ci || process.env.CI === "true" || process.env.CI === "1";

      if (isCi) {
        console.error(
          "Error: onpush deinit requires interactive mode. In CI, remove .onpush/ and docs manually."
        );
        process.exitCode = 1;
        return;
      }

      let configPath: string;
      let configDir: string;
      let outputDir: string | undefined;

      try {
        configPath = resolveConfigPath(globalOpts.config);
        const config = await loadConfig(globalOpts.config);
        configDir = getConfigDir(configPath);
        outputDir = resolve(configDir, "..", config.output.directory);
      } catch {
        configPath = resolveConfigPath(globalOpts.config);
        configDir = getConfigDir(configPath);
      }

      p.intro("OnPush — Remove configuration");

      const toRemove = (await p.multiselect({
        message: "What would you like to remove?",
        options: [
          {
            value: "config",
            label: "Configuration",
            hint: ".onpush/ directory (config.yml, state.json, cache)",
          },
          {
            value: "docs",
            label: "Generated docs",
            hint: outputDir ?? "docs/",
          },
        ],
        required: true,
      })) as string[];

      if (p.isCancel(toRemove)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }

      const confirm = await p.confirm({
        message: `Final Confirmation: Remove ${toRemove.join(" and ")}?`,
      });

      if (p.isCancel(confirm) || !confirm) {
        p.cancel("Cancelled.");
        process.exit(0);
      }

      if (toRemove.includes("docs") && outputDir) {
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
          // Directory doesn't exist
        }
        p.log.success(
          removedCount > 0
            ? `Removed ${removedCount} generated doc${removedCount > 1 ? "s" : ""}`
            : "No generated docs found"
        );
      }

      if (toRemove.includes("config")) {
        try {
          await rm(configDir, { recursive: true, force: true });
          p.log.success("Removed .onpush/ directory");
        } catch {
          p.log.error("Failed to remove .onpush/ directory");
        }
      }

      p.outro("Done.");
    });
}
