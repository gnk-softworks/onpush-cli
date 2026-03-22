import { z } from "zod";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { ConfigError } from "./errors.js";

const ProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const OutputSchema = z.object({
  directory: z.string().default("docs/"),
  filename_template: z
    .string()
    .default("{slug}.md")
    .refine(
      (t) => !t.includes("..") && !t.startsWith("/"),
      "filename_template must not contain '..' or start with '/'"
    ),
  toc: z.boolean().default(true),
  branch: z.string().optional(),
});

const ByokSchema = z.object({
  type: z.enum(["openai", "azure", "anthropic"]),
  base_url: z.string().min(1),
  api_key: z.string().optional(),
});

const GenerationSchema = z.object({
  provider: z.enum(["anthropic", "copilot"]).default("anthropic"),
  model: z.string().default("claude-sonnet-4-6"),
  copilot_byok: ByokSchema.optional(),
  cost_limit: z.number().positive().nullable().default(null),
  timeout: z.number().positive().default(3600),
  parallel: z.number().int().positive().default(10),
});

const TypeConfigSchema = z.object({
  enabled: z.boolean(),
  name: z.string().optional(),
  prompt: z.string().optional(),
  model: z.string().optional(),
});

const SafeSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CustomTypeSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(
      SafeSlugPattern,
      "Slug must contain only lowercase alphanumeric characters and hyphens (e.g. 'my-doc-type')"
    ),
  name: z.string().min(1),
  description: z.string().min(1),
  prompt: z.string().min(1),
});

const RepositorySchema = z
  .object({
    path: z.string().optional(),
    url: z.string().optional(),
    github: z.string().optional(),
    ref: z.string().optional(),
    name: z.string().min(1),
  })
  .refine(
    (r) =>
      [r.path, r.url, r.github].filter((v) => v !== undefined).length === 1,
    { message: "Each repository must specify exactly one of: path, url, github" }
  );

const BaseConfigSchema = z.object({
  version: z.number().default(1),
  project: ProjectSchema,
  output: OutputSchema.default({
    directory: "docs/",
    filename_template: "{slug}.md",
    toc: true,
  }),
  generation: GenerationSchema.default({
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    cost_limit: null,
    timeout: 3600,
    parallel: 10,
  }),
  types: z.record(z.string(), TypeConfigSchema).default({}),
  custom_types: z.array(CustomTypeSchema).default([]),
  exclude: z
    .array(z.string())
    .default([
      "node_modules/**",
      "dist/**",
      "build/**",
      ".git/**",
      "**/*.lock",
      "**/*.min.js",
      ".env*",
      "**/credentials*",
      "**/secrets*",
      "**/*.pem",
      "**/*.key",
    ]),
});

const SingleRepoConfigSchema = BaseConfigSchema.extend({
  mode: z.literal("current"),
  repository: z.object({ path: z.string() }).optional(),
});

const MultiRepoConfigSchema = BaseConfigSchema.extend({
  mode: z.literal("remote"),
  repositories: z.array(RepositorySchema).min(1),
});

const OnPushConfigSchema = z.discriminatedUnion("mode", [
  SingleRepoConfigSchema,
  MultiRepoConfigSchema,
]);

export type OnPushConfig = z.infer<typeof OnPushConfigSchema>;

/**
 * Resolves the path to the config file.
 * If a flag path is provided, uses that. Otherwise, looks for .onpush/config.yml
 * relative to cwd.
 */
export function resolveConfigPath(flagPath?: string): string {
  if (flagPath) {
    return resolve(flagPath);
  }
  return resolve(process.cwd(), ".onpush", "config.yml");
}

/**
 * Returns the .onpush directory for a given config file path.
 */
export function getConfigDir(configPath: string): string {
  return dirname(configPath);
}

/**
 * Loads and validates the OnPush config file.
 * Returns the validated config object or throws ConfigError.
 */
export async function loadConfig(configPath?: string): Promise<OnPushConfig> {
  const resolvedPath = resolveConfigPath(configPath);

  let raw: string;
  try {
    raw = await readFile(resolvedPath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ConfigError(
        `Config file not found at ${resolvedPath}\nRun 'onpush init' to create one.`
      );
    }
    throw new ConfigError(
      `Failed to read config file at ${resolvedPath}: ${(err as Error).message}`
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err: unknown) {
    throw new ConfigError(
      `Invalid YAML in config file: ${(err as Error).message}`
    );
  }

  const result = OnPushConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`Invalid config:\n${issues}`);
  }

  return result.data;
}

/**
 * Saves the config object back to the YAML config file.
 */
export async function saveConfig(
  configPath: string | undefined,
  config: OnPushConfig
): Promise<void> {
  const resolvedPath = resolveConfigPath(configPath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, stringifyYaml(config as Record<string, unknown>), "utf-8");
}
