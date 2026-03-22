import type { Command } from "commander";
import { writeFile, mkdir, readFile, appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { stringify as yamlStringify } from "yaml";
import { runInitWizard, type InitWizardResult, type ExistingConfig } from "../ui/prompts.js";
import { CancelError } from "../../core/errors.js";
import { DEFAULT_DOCUMENT_TYPES } from "../../core/document-types.js";
import { DEFAULT_MODELS } from "../../generation/providers/types.js";
import { loadConfig } from "../../core/config.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Interactive setup wizard — creates .onpush/config.yml")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isCi =
        globalOpts.ci || process.env.CI === "true" || process.env.CI === "1";

      if (isCi) {
        console.error(
          "Error: onpush init requires interactive mode. In CI, create .onpush/config.yml manually."
        );
        process.exit(1);
      }

      // Load existing config if present, to use as defaults
      let existing: ExistingConfig | undefined;
      try {
        const config = await loadConfig(globalOpts.config);
        const enabledTypes = DEFAULT_DOCUMENT_TYPES
          .filter((dt) => {
            const override = config.types[dt.slug];
            return override ? override.enabled : dt.defaultEnabled;
          })
          .map((dt) => dt.slug);

        existing = {
          provider: config.generation.provider,
          mode: config.mode,
          projectName: config.project.name,
          projectDescription: config.project.description,
          outputDir: config.output.directory,
          enabledTypes,
          parallel: config.generation.parallel,
          timeout: config.generation.timeout,
          customTypes: config.custom_types,
          excludePatterns: config.exclude,
        };
      } catch {
        // No existing config — fresh init
      }

      try {
        const result = await runInitWizard(existing);
        await writeConfig(result);

        console.log();
        console.log(`  Created .onpush/config.yml`);
        console.log(`  Run 'onpush generate' to generate documentation.`);
        console.log();
      } catch (err) {
        if (err instanceof CancelError) return;
        throw err;
      }
    });
}

async function writeConfig(result: InitWizardResult): Promise<void> {
  const configDir = resolve(process.cwd(), ".onpush");
  await mkdir(configDir, { recursive: true });

  const types: Record<string, { enabled: boolean }> = {};
  for (const dt of DEFAULT_DOCUMENT_TYPES) {
    types[dt.slug] = { enabled: result.enabledTypes.includes(dt.slug) };
  }

  const config: Record<string, unknown> = {
    version: 1,
    mode: result.mode,
    project: {
      name: result.projectName,
      ...(result.projectDescription
        ? { description: result.projectDescription }
        : {}),
    },
    output: {
      directory: result.outputDir,
      filename_template: "{slug}.md",
      toc: true,
    },
    generation: {
      provider: result.provider,
      model: DEFAULT_MODELS[result.provider],
      cost_limit: null,
      timeout: result.timeout,
      parallel: result.parallel,
    },
    types,
    custom_types: result.customTypes,
    exclude: result.excludePatterns,
  };

  if (result.mode === "remote" && result.repositories) {
    const repos = result.repositories.map((r) => {
      // Detect if it's a github shorthand (org/repo), URL, or local path
      if (r.source.includes("://") || r.source.startsWith("git@")) {
        return { url: r.source, name: r.name };
      }
      if (r.source.match(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/)) {
        return { github: r.source, name: r.name };
      }
      return { path: r.source, name: r.name };
    });
    config.repositories = repos;
  }

  const configPath = join(configDir, "config.yml");
  await writeFile(configPath, yamlStringify(config), "utf-8");

  // Update .gitignore
  await updateGitignore();
}

async function updateGitignore(): Promise<void> {
  const gitignorePath = resolve(process.cwd(), ".gitignore");
  const entry = "\n# OnPush - cached repository clones\n.onpush/cache/\n";

  try {
    const content = await readFile(gitignorePath, "utf-8");
    if (content.includes(".onpush/cache/")) return;
    await appendFile(gitignorePath, entry);
  } catch {
    // .gitignore doesn't exist — create it
    await writeFile(gitignorePath, entry.trimStart(), "utf-8");
  }
}
