import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerInitCommand } from "./commands/init.js";
import { registerGenerateCommand } from "./commands/generate.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerTypesCommand } from "./commands/types.js";
import { registerCostCommand } from "./commands/cost.js";
import { registerCleanCommand } from "./commands/clean.js";
import { registerDeinitCommand } from "./commands/deinit.js";

const pkgPath = fileURLToPath(new URL("../../package.json", import.meta.url));
const { version } = JSON.parse(readFileSync(pkgPath, "utf-8"));

const program = new Command();

program
  .name("onpush")
  .description("AI-powered documentation generator for software projects")
  .version(version)
  .option("--config <path>", "Path to config file (default: .onpush/config.yml)")
  .option(
    "--anthropic-api-key <key>",
    "Anthropic API key (overrides env var and Claude Code auth)"
  )
  .option(
    "--github-token <token>",
    "GitHub token for Copilot provider (overrides env vars)"
  )
  .option(
    "--provider <name>",
    "AI provider: anthropic or copilot (overrides config)"
  )
  .option("--quiet", "Suppress all output except errors")
  .option("--no-color", "Disable colored output")
  .option(
    "--ci",
    "Force CI mode (auto-detected via CI=true env var)"
  );

registerInitCommand(program);
registerGenerateCommand(program);
registerStatusCommand(program);
registerTypesCommand(program);
registerCostCommand(program);
registerCleanCommand(program);
registerDeinitCommand(program);

export async function run(): Promise<void> {
  await program.parseAsync(process.argv);
}
