import type { Command } from "commander";
import * as p from "@clack/prompts";
import chalk from "chalk";
import { loadConfig, saveConfig } from "../../core/config.js";
import { DEFAULT_DOCUMENT_TYPES, type OnPushConfig } from "../../core/document-types.js";
import { promptCustomType } from "../ui/prompts.js";
import { CancelError } from "../../core/errors.js";

export function registerTypesCommand(program: Command): void {
  program
    .command("types")
    .description("List and manage document types")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      try {
        const config = await loadConfig(globalOpts.config);

        p.intro("OnPush — Document Types");

        let done = false;
        while (!done) {
          printCurrentTypes(config);

          const actions: Array<{ value: string; label: string; hint?: string }> = [
            { value: "toggle", label: "Toggle types", hint: "Enable or disable default document types" },
            { value: "create", label: "Create custom type", hint: "Define a new document type" },
          ];

          if (config.custom_types.length > 0) {
            actions.push({
              value: "delete",
              label: "Delete custom type",
              hint: `${config.custom_types.length} custom type${config.custom_types.length > 1 ? "s" : ""}`,
            });
          }

          actions.push({ value: "done", label: "Done" });

          const action = (await p.select({
            message: "What would you like to do?",
            options: actions,
          })) as string;

          if (p.isCancel(action) || action === "done") {
            done = true;
            break;
          }

          if (action === "toggle") {
            await handleToggle(config);
            await saveConfig(globalOpts.config, config);
            p.log.success("Types updated.");
          } else if (action === "create") {
            const customType = await promptCustomType();
            config.custom_types.push(customType);
            await saveConfig(globalOpts.config, config);
            p.log.success(`Created custom type: ${customType.name}`);
          } else if (action === "delete") {
            await handleDelete(config);
            await saveConfig(globalOpts.config, config);
          }
        }

        p.outro("Done.");
      } catch (err: unknown) {
        if (err instanceof CancelError) return;
        console.error(chalk.red(`  Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });
}

function printCurrentTypes(config: OnPushConfig): void {
  const enabled: Array<{ slug: string; name: string; custom: boolean }> = [];
  const disabled: Array<{ slug: string; name: string }> = [];

  for (const dt of DEFAULT_DOCUMENT_TYPES) {
    const override = config.types[dt.slug];
    const isEnabled = override ? override.enabled : dt.defaultEnabled;
    const name = override?.name ?? dt.name;
    if (isEnabled) {
      enabled.push({ slug: dt.slug, name, custom: false });
    } else {
      disabled.push({ slug: dt.slug, name });
    }
  }

  for (const ct of config.custom_types) {
    enabled.push({ slug: ct.slug, name: ct.name, custom: true });
  }

  console.log();
  if (enabled.length > 0) {
    p.log.info(
      `${chalk.bold("Enabled:")} ${enabled.map((t) => t.custom ? chalk.green(t.name) : chalk.cyan(t.name)).join(", ")}`
    );
  }
  if (disabled.length > 0) {
    p.log.info(
      `${chalk.bold("Disabled:")} ${disabled.map((t) => chalk.dim(t.name)).join(", ")}`
    );
  }
  console.log();
}

async function handleToggle(config: OnPushConfig): Promise<void> {
  const options: Array<{ value: string; label: string; hint?: string }> = [
    ...DEFAULT_DOCUMENT_TYPES.map((dt) => ({
      value: dt.slug,
      label: dt.name,
      hint: dt.description,
    })),
    ...config.custom_types.map((ct) => ({
      value: ct.slug,
      label: `${ct.name} (custom)`,
      hint: ct.description,
    })),
  ];

  const currentlyEnabled = [
    ...DEFAULT_DOCUMENT_TYPES
      .filter((dt) => {
        const override = config.types[dt.slug];
        return override ? override.enabled : dt.defaultEnabled;
      })
      .map((dt) => dt.slug),
    ...config.custom_types.map((ct) => ct.slug),
  ];

  const selected = (await p.multiselect({
    message: "Select which types to enable",
    options,
    initialValues: currentlyEnabled,
    required: false,
  })) as string[];

  if (p.isCancel(selected)) return;

  // Update default types
  for (const dt of DEFAULT_DOCUMENT_TYPES) {
    const existing = config.types[dt.slug];
    const shouldBeEnabled = selected.includes(dt.slug);
    if (existing) {
      existing.enabled = shouldBeEnabled;
    } else {
      config.types[dt.slug] = { enabled: shouldBeEnabled };
    }
  }

  // Remove custom types that were unchecked
  config.custom_types = config.custom_types.filter((ct) =>
    selected.includes(ct.slug)
  );
}

async function handleDelete(config: OnPushConfig): Promise<void> {
  if (config.custom_types.length === 0) {
    p.log.warn("No custom types to delete.");
    return;
  }

  const toDelete = (await p.select({
    message: "Select a custom type to delete",
    options: config.custom_types.map((ct) => ({
      value: ct.slug,
      label: ct.name,
      hint: ct.description,
    })),
  })) as string;

  if (p.isCancel(toDelete)) return;

  const name = config.custom_types.find((ct) => ct.slug === toDelete)?.name;
  config.custom_types = config.custom_types.filter((ct) => ct.slug !== toDelete);
  p.log.success(`Deleted custom type: ${name}`);
}
