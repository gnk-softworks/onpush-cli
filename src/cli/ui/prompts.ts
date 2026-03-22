import { basename } from "node:path";
import * as p from "@clack/prompts";
import { DEFAULT_DOCUMENT_TYPES } from "../../core/document-types.js";
import { CancelError } from "../../core/errors.js";

export interface InitWizardResult {
  provider: "anthropic" | "copilot";
  mode: "current" | "remote";
  projectName: string;
  projectDescription?: string;
  outputDir: string;
  enabledTypes: string[];
  parallel: number;
  timeout: number;
  customTypes: Array<{
    slug: string;
    name: string;
    description: string;
    prompt: string;
  }>;
  excludePatterns: string[];
  // Multi mode only
  repositories?: Array<{
    source: string; // path, URL, or github shorthand
    name: string;
  }>;
}

const DEFAULT_EXCLUDES = [
  "node_modules/**",
  "dist/**",
  "build/**",
  ".git/**",
  "**/*.lock",
  "**/*.min.js",
];

const SECURITY_EXCLUDES = [
  ".env*",
  "**/credentials*",
  "**/secrets*",
  "**/*.pem",
  "**/*.key",
];

/**
 * Runs the interactive init wizard using @clack/prompts.
 */
export interface ExistingConfig {
  provider?: "anthropic" | "copilot";
  mode?: "current" | "remote";
  projectName?: string;
  projectDescription?: string;
  outputDir?: string;
  enabledTypes?: string[];
  parallel?: number;
  timeout?: number;
  customTypes?: InitWizardResult["customTypes"];
  excludePatterns?: string[];
}

export async function runInitWizard(existing?: ExistingConfig): Promise<InitWizardResult> {
  p.intro("OnPush — AI Documentation Generator");

  const provider = (await p.select({
    message: "AI Provider",
    initialValue: existing?.provider ?? "anthropic",
    options: [
      {
        value: "anthropic",
        label: "Anthropic (Claude) — Uses Claude Code / Anthropic API key",
      },
      {
        value: "copilot",
        label: "GitHub Copilot — Uses GitHub authentication / Copilot SDK",
      },
    ],
  })) as "anthropic" | "copilot";

  if (p.isCancel(provider)) {
    p.cancel("Setup cancelled.");
    throw new CancelError();
  }

  const mode = (await p.select({
    message: "Mode",
    initialValue: existing?.mode,
    options: [
      {
        value: "current",
        label: "Current Repo — Document this repository",
      },
      {
        value: "remote",
        label: "Remote Repo(s) — Document one or multiple repositories from a dedicated docs location",
      },
    ],
  })) as "current" | "remote";

  if (p.isCancel(mode)) {
    p.cancel("Setup cancelled.");
    throw new CancelError();
  }

  const defaultName = existing?.projectName ?? basename(process.cwd());
  const projectName = (await p.text({
    message: "Project name",
    defaultValue: defaultName,
    placeholder: defaultName,
    validate: (value) => {
      if (!value && !defaultName) return "Project name is required";
    },
  })) as string;

  if (p.isCancel(projectName)) {
    p.cancel("Setup cancelled.");
    throw new CancelError();
  }

  const projectDescription = (await p.text({
    message: "Description (optional)",
    defaultValue: existing?.projectDescription,
    placeholder: existing?.projectDescription ?? "Brief description of the project",
  })) as string;

  if (p.isCancel(projectDescription)) {
    p.cancel("Setup cancelled.");
    throw new CancelError();
  }

  const defaultOutputDir = existing?.outputDir ?? "docs/";
  const outputDir = (await p.text({
    message: "Output directory",
    defaultValue: defaultOutputDir,
    placeholder: defaultOutputDir,
  })) as string;

  if (p.isCancel(outputDir)) {
    p.cancel("Setup cancelled.");
    throw new CancelError();
  }

  // Multi mode: add repositories
  let repositories: InitWizardResult["repositories"];
  if (mode === "remote") {
    repositories = [];
    let addMore = true;

    while (addMore) {
      const source = (await p.text({
        message: "Repository (local path, Git URL, or GitHub shorthand)",
        validate: (value) => {
          if (!value.trim()) return "Repository source is required";
        },
      })) as string;

      if (p.isCancel(source)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      const repoName = (await p.text({
        message: "Repository name",
        validate: (value) => {
          if (!value.trim()) return "Repository name is required";
        },
      })) as string;

      if (p.isCancel(repoName)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      repositories.push({ source, name: repoName });

      const another = await p.confirm({
        message: "Add another repository?",
        initialValue: false,
      });

      if (p.isCancel(another)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      addMore = another as boolean;
    }
  }

  // Select and manage document types
  const { enabledTypes, customTypes } = await promptDocumentTypes(
    existing?.enabledTypes,
    existing?.customTypes
  );

  // Parallel generation
  const defaultParallel = String(existing?.parallel ?? 10);
  const parallelInput = (await p.text({
    message: "Parallel document generations (default: 10)",
    defaultValue: defaultParallel,
    placeholder: defaultParallel,
    validate: (value) => {
      if (!value) return undefined; // accept default
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 1) return "Must be a positive integer";
    },
  })) as string;

  if (p.isCancel(parallelInput)) {
    p.cancel("Setup cancelled.");
    throw new CancelError();
  }

  const parallel = parseInt(parallelInput || "10", 10);

  // Timeout per document
  const defaultTimeout = String(existing?.timeout ?? 3600);
  const timeoutInput = (await p.text({
    message: "Timeout per document in seconds",
    defaultValue: defaultTimeout,
    placeholder: defaultTimeout,
    validate: (value) => {
      if (!value) return undefined;
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 60) return "Must be at least 60 seconds";
    },
  })) as string;

  if (p.isCancel(timeoutInput)) {
    p.cancel("Setup cancelled.");
    throw new CancelError();
  }

  const timeout = parseInt(timeoutInput || "3600", 10);

  // Exclude patterns
  const defaultExcludesStr = DEFAULT_EXCLUDES.join(", ");
  const customExcludesInput = (await p.text({
    message: "Add custom exclude patterns? (comma-separated, optional)",
    placeholder: `Defaults: ${defaultExcludesStr}`,
  })) as string;

  if (p.isCancel(customExcludesInput)) {
    p.cancel("Setup cancelled.");
    throw new CancelError();
  }

  const customExcludes = customExcludesInput
    ? customExcludesInput
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];

  const excludePatterns = [
    ...DEFAULT_EXCLUDES,
    ...SECURITY_EXCLUDES,
    ...customExcludes,
  ];

  return {
    provider,
    mode,
    projectName,
    projectDescription: projectDescription || undefined,
    outputDir: outputDir || "docs/",
    parallel,
    timeout,
    enabledTypes,
    customTypes,
    excludePatterns,
    repositories,
  };
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function promptCustomType(): Promise<{
  slug: string;
  name: string;
  description: string;
  prompt: string;
}> {
  const name = (await p.text({
    message: "Document type name",
    placeholder: "e.g. Testing Guide",
    validate: (value) => {
      if (!value?.trim()) return "Name is required";
    },
  })) as string;

  if (p.isCancel(name)) {
    p.cancel("Setup cancelled.");
    throw new CancelError();
  }

  const defaultSlug = slugFromName(name);
  const slug = (await p.text({
    message: "Slug (URL-safe identifier)",
    defaultValue: defaultSlug,
    placeholder: defaultSlug,
  })) as string;

  if (p.isCancel(slug)) {
    p.cancel("Setup cancelled.");
    throw new CancelError();
  }

  const description = (await p.text({
    message: "Description — what does this document cover?",
    placeholder: "e.g. Testing strategy, fixtures, and how to write new tests",
    validate: (value) => {
      if (!value?.trim()) return "Description is required";
    },
  })) as string;

  if (p.isCancel(description)) {
    p.cancel("Setup cancelled.");
    throw new CancelError();
  }

  const audience = (await p.text({
    message: "Target audience — who is this document for?",
    placeholder: "e.g. New developers onboarding to the project",
    validate: (value) => {
      if (!value?.trim()) return "Target audience is required";
    },
  })) as string;

  if (p.isCancel(audience)) {
    p.cancel("Setup cancelled.");
    throw new CancelError();
  }

  const sectionsInput = (await p.text({
    message: "Sections to cover (comma-separated)",
    placeholder: "e.g. Unit Tests, Integration Tests, E2E Tests, Test Fixtures",
    validate: (value) => {
      if (!value?.trim()) return "At least one section is required";
    },
  })) as string;

  if (p.isCancel(sectionsInput)) {
    p.cancel("Setup cancelled.");
    throw new CancelError();
  }

  const sections = sectionsInput
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const guidanceInput = (await p.text({
    message: "Additional guidance for the AI (optional)",
    placeholder: "e.g. Include code examples for each test type",
  })) as string;

  if (p.isCancel(guidanceInput)) {
    p.cancel("Setup cancelled.");
    throw new CancelError();
  }

  const prompt = buildCustomPrompt({
    name,
    description,
    audience,
    sections,
    guidance: guidanceInput || undefined,
  });

  return {
    slug: slug || defaultSlug,
    name,
    description,
    prompt,
  };
}

function buildCustomPrompt(opts: {
  name: string;
  description: string;
  audience: string;
  sections: string[];
  guidance?: string;
}): string {
  const sectionsList = opts.sections
    .map((s, i) => `${i + 1}. **${s}**`)
    .join("\n");

  const guidanceLines = opts.guidance
    ? opts.guidance
        .split(/[.,;]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => `- ${s}`)
        .join("\n")
    : "";

  let prompt = `Generate a ${opts.description.toLowerCase()} document for ${opts.audience.toLowerCase()}.

### Sections to Cover

${sectionsList}`;

  if (guidanceLines) {
    prompt += `

### Guidance

${guidanceLines}`;
  }

  return prompt;
}

const MANAGE_TYPES_VALUE = "__manage__";

async function promptDocumentTypes(
  existingEnabled?: string[],
  existingCustom?: InitWizardResult["customTypes"]
): Promise<{
  enabledTypes: string[];
  customTypes: InitWizardResult["customTypes"];
}> {
  let enabledTypes: string[] = existingEnabled ?? DEFAULT_DOCUMENT_TYPES
    .filter((t) => t.defaultEnabled)
    .map((t) => t.slug);
  const customTypes: InitWizardResult["customTypes"] = [...(existingCustom ?? [])];

  while (true) {
    // Build options: default types as checkboxes + custom types as checkboxes + manage action
    const options: Array<{ value: string; label: string; hint?: string }> = [
      ...DEFAULT_DOCUMENT_TYPES.map((t) => ({
        value: t.slug,
        label: t.name,
        hint: t.description,
      })),
      ...customTypes.map((ct) => ({
        value: ct.slug,
        label: `${ct.name} (custom)`,
        hint: ct.description,
      })),
      {
        value: MANAGE_TYPES_VALUE,
        label: "Add / edit more document types...",
      },
    ];

    const initialValues = [
      ...enabledTypes,
      ...customTypes.map((ct) => ct.slug),
    ];

    const selected = (await p.multiselect({
      message: "Select document types to generate",
      options,
      initialValues,
      required: false,
    })) as string[];

    if (p.isCancel(selected)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    if (selected.includes(MANAGE_TYPES_VALUE)) {
      // Enter manage mode — remove the sentinel from selection
      const filtered = selected.filter((s) => s !== MANAGE_TYPES_VALUE);
      enabledTypes = filtered.filter(
        (s) => !customTypes.some((ct) => ct.slug === s)
      );

      await manageCustomTypes(customTypes);
      // Loop back to show the type list again
      continue;
    }

    // Final selection — split into enabled defaults and custom
    enabledTypes = selected.filter(
      (s) => !customTypes.some((ct) => ct.slug === s)
    );
    return { enabledTypes, customTypes };
  }
}

async function manageCustomTypes(
  customTypes: InitWizardResult["customTypes"]
): Promise<void> {
  while (true) {
    const actions: Array<{ value: string; label: string; hint?: string }> = [
      { value: "create", label: "Create custom type" },
    ];

    if (customTypes.length > 0) {
      actions.push({
        value: "delete",
        label: "Delete custom type",
        hint: `${customTypes.length} custom type${customTypes.length > 1 ? "s" : ""}`,
      });
    }

    actions.push({ value: "done", label: "Back to type selection" });

    const action = (await p.select({
      message: "Manage custom document types",
      options: actions,
    })) as string;

    if (p.isCancel(action) || action === "done") {
      break;
    }

    if (action === "create") {
      const ct = await promptCustomType();
      customTypes.push(ct);
      p.log.success(`Created: ${ct.name}`);
    } else if (action === "delete") {
      const toDelete = (await p.select({
        message: "Select a custom type to delete",
        options: customTypes.map((ct) => ({
          value: ct.slug,
          label: ct.name,
          hint: ct.description,
        })),
      })) as string;

      if (!p.isCancel(toDelete)) {
        const idx = customTypes.findIndex((ct) => ct.slug === toDelete);
        if (idx !== -1) {
          const name = customTypes[idx].name;
          customTypes.splice(idx, 1);
          p.log.success(`Deleted: ${name}`);
        }
      }
    }
  }
}
