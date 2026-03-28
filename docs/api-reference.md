---
title: API / SDK Reference
generated_by: onpush
generated_at: 2026-03-28T22:20:41.033Z
version: 1
model: claude-sonnet-4-6
---

# API / SDK Reference

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Authentication](#authentication)
- [CLI Reference](#cli-reference)
  - [Global Options](#global-options)
  - [`onpush init`](#onpush-init)
  - [`onpush generate`](#onpush-generate)
  - [`onpush types`](#onpush-types)
  - [`onpush status`](#onpush-status)
  - [`onpush cost`](#onpush-cost)
  - [`onpush clean`](#onpush-clean)
  - [`onpush deinit`](#onpush-deinit)
- [Configuration Schema](#configuration-schema)
  - [Top-Level Fields](#top-level-fields)
  - [`project`](#project)
  - [`output`](#output)
  - [`generation`](#generation)
  - [`types`](#types)
  - [`custom_types`](#custom_types)
  - [`repositories` (remote mode)](#repositories-remote-mode)
  - [`exclude`](#exclude)
- [Environment Variables](#environment-variables)
- [JSON Output Schema](#json-output-schema)
- [State File Schema](#state-file-schema)
- [Document Frontmatter Schema](#document-frontmatter-schema)
- [Data Models](#data-models)
- [Error Handling & Exit Codes](#error-handling--exit-codes)

---

## Overview

`onpush-cli` is a CLI tool (`onpush`) distributed via npm. It exposes no HTTP API or importable library — all integration surfaces are:

- **CLI**: the `onpush` command and its subcommands
- **Configuration file**: `.onpush/config.yml` (YAML, validated with Zod)
- **JSON output**: structured output from `onpush generate --json` for CI/CD integration
- **State file**: `.onpush/state.json` (internal, read-only for consumers)
- **Document frontmatter**: YAML frontmatter prepended to every generated Markdown file

The binary entrypoint is `dist/bin/onpush.js` (mapped to the `onpush` shell command via `package.json#bin`). It is built with TypeScript and requires Node.js ≥ 20.

---

## Installation

```bash
# Install globally from npm
npm install -g onpush-cli

# Or install from source
git clone git@github.com:gnk-softworks/onpush-cli.git
cd onpush-cli
npm install
npm run build
npm link
```

Verify installation:

```bash
onpush --version
```

---

## Authentication

OnPush delegates all AI work to an external provider. Authentication is resolved at runtime using a priority chain for each provider.

### Anthropic (default provider)

| Priority | Source | Details |
|----------|--------|---------|
| 1 (highest) | `--anthropic-api-key <key>` CLI flag | Passed directly to the Anthropic Agent SDK |
| 2 | `ANTHROPIC_API_KEY` environment variable | Standard Anthropic credential |
| 3 (lowest) | Active Claude Code session | The Agent SDK automatically uses the logged-in Claude Code session when no key is present |

```bash
# Flag (highest priority)
onpush generate --anthropic-api-key sk-ant-...

# Environment variable
ANTHROPIC_API_KEY=sk-ant-... onpush generate

# Claude Code session (no flag or env var needed if logged in)
onpush generate
```

### GitHub Copilot provider

| Priority | Source | Details |
|----------|--------|---------|
| 1 (highest) | `--github-token <token>` CLI flag | Passed to the Copilot SDK |
| 2 | `COPILOT_GITHUB_TOKEN` env var | Highest-priority env var for Copilot |
| 3 | `GH_TOKEN` env var | Fallback |
| 4 | `GITHUB_TOKEN` env var | Also used for cloning private repos |
| 5 (lowest) | GitHub CLI stored credentials | Copilot SDK resolves these automatically |

```bash
# Flag
onpush generate --provider copilot --github-token ghp_...

# Environment variable
COPILOT_GITHUB_TOKEN=ghp_... onpush generate --provider copilot
```

### Bring Your Own Key (BYOK) — Copilot provider only

When using the Copilot provider you can route generation through any OpenAI-compatible, Azure, or Anthropic endpoint:

```bash
onpush generate --provider copilot \
  --byok-type openai \
  --byok-base-url https://my-openai-proxy.example.com/v1 \
  --byok-api-key sk-...
```

BYOK can also be set via environment variables (`ONPUSH_BYOK_TYPE`, `ONPUSH_BYOK_BASE_URL`, `ONPUSH_BYOK_API_KEY`) or in `config.yml` under `generation.copilot_byok`.

---

## CLI Reference

### Global Options

These options are available on **all** subcommands.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--config <path>` | `string` | `.onpush/config.yml` | Path to the config file |
| `--anthropic-api-key <key>` | `string` | — | Anthropic API key; overrides `ANTHROPIC_API_KEY` and Claude Code session |
| `--github-token <token>` | `string` | — | GitHub token for the Copilot provider; overrides all `*_TOKEN` env vars |
| `--provider <name>` | `anthropic \| copilot` | From config | Override the AI provider |
| `--quiet` | `boolean` | `false` | Suppress all output except errors |
| `--no-color` | `boolean` | `false` | Disable ANSI colour in output |
| `--ci` | `boolean` | Auto-detected via `CI=true` | Force CI mode (plain-text progress, JSON summary) |

---

### `onpush init`

Interactive setup wizard that creates or updates `.onpush/config.yml`.

```bash
onpush init [global-options]
```

**Behaviour**

- Not available in CI mode (`--ci` or `CI=true`). Use a manually-created `config.yml` in CI.
- If a `config.yml` already exists, existing values are used as defaults in the wizard.
- Appends `.onpush/cache/` to `.gitignore` automatically.
- Prompts for:
  - AI provider (`anthropic` or `copilot`)
  - Operating mode: **Current Repo** or **Remote Repo(s)**
  - Project name and optional description
  - Output directory
  - Which default document types to enable
  - Zero or more custom document types
  - Parallelism and timeout settings
  - File exclude patterns

---

### `onpush generate`

Generate or incrementally update documentation using the configured AI provider.

```bash
onpush generate [options] [global-options]
```

**Options**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--full` | `boolean` | `false` | Force full regeneration; ignores incremental state |
| `--type <slug>` | `string` | — | Generate a single document type by its slug |
| `--single-file` | `boolean` | `false` | Merge all generated docs into `complete-documentation.md` |
| `--model <model>` | `string` | From config | Override the AI model for this run |
| `--parallel <n>` | `integer` | From config (`10`) | Number of documents to generate concurrently |
| `--output <dir>` | `string` | From config | Override the output directory |
| `--verbose` | `boolean` | `false` | Show per-turn tool-use and text from the agent |
| `--json` | `boolean` | `false` | Print a structured JSON summary to stdout (auto-enabled in CI) |
| `--cost-limit <usd>` | `number` | From config | Abort generation if accumulated cost exceeds this USD amount |
| `--provider <name>` | `anthropic \| copilot` | From config | Override the AI provider |
| `--byok-type <type>` | `openai \| azure \| anthropic` | — | BYOK provider type (Copilot only) |
| `--byok-base-url <url>` | `string` | — | BYOK API base URL (Copilot only) |
| `--byok-api-key <key>` | `string` | — | BYOK API key (Copilot only) |

**Example invocations**

```bash
# First-time full generation
onpush generate

# Force full regeneration, show verbose agent output
onpush generate --full --verbose

# Incremental update, limit cost to $2
onpush generate --cost-limit 2.00

# Generate only the API reference document
onpush generate --type api-reference

# Output structured JSON (useful in scripts)
onpush generate --json

# Use Copilot provider with BYOK Azure endpoint
onpush generate --provider copilot \
  --byok-type azure \
  --byok-base-url https://my-org.openai.azure.com \
  --byok-api-key my-key

# Merge all docs into one file
onpush generate --single-file
```

**Generation modes**

| Mode | When | Behaviour |
|------|------|-----------|
| Full | First run, or `--full` flag | Generates all enabled document types from scratch |
| Incremental | Subsequent runs with detected git changes | Runs a triage agent to identify affected types, then regenerates only those |
| No-op | Subsequent runs with no git changes | Skips all generation; exits `0` |

---

### `onpush types`

Interactive TUI for managing document types. Not available in CI mode.

```bash
onpush types [global-options]
```

**Actions available in the TUI**

- **Toggle types** — enable or disable any default or custom type
- **Create custom type** — guided wizard that collects name, slug, description, target audience, sections, and extra prompt guidance
- **Delete custom type** — select a custom type to remove from config

Changes are saved to `config.yml` immediately after each action.

---

### `onpush status`

Show the current documentation state, last generation metadata, and repository change status.

```bash
onpush status [global-options]
```

**Example output**

```
  Project: My API (this repo)
  Last generation: 28/03/2026 14:32
  Documents: 6 generated, 0 pending
  Repository: abc1234 → def5678 (3 commits behind)

  Run 'onpush generate' to update.
```

For remote-repo mode, each configured repository is listed with its individual sync status.

---

### `onpush cost`

Display historical cost data from `.onpush/state.json`.

```bash
onpush cost [global-options]
```

**Example output**

```
  Generation history (last 10):
    28/03/2026  full          6 docs  $0.2341  14.2K tokens
    27/03/2026  incremental   2 docs  $0.0412   3.8K tokens

  Total: $0.2753 across 2 generations
```

Up to 10 most recent entries are displayed. Up to 100 entries are stored in state.

---

### `onpush clean`

Remove all generated Markdown files and the state file. The `config.yml` is preserved.

```bash
onpush clean [global-options]
```

- Deletes all `.md` files from the configured output directory
- Deletes `.onpush/state.json`
- Does not modify `.onpush/config.yml`

---

### `onpush deinit`

Interactive removal of OnPush configuration and/or generated documentation. Not available in CI mode.

```bash
onpush deinit [global-options]
```

Presents a multi-select prompt to choose what to remove:

| Option | What is removed |
|--------|-----------------|
| `Configuration` | The entire `.onpush/` directory (config, state, cache) |
| `Generated docs` | All `.md` files in the configured output directory |

Requires explicit confirmation before any files are deleted.

---

## Configuration Schema

Config file location: `.onpush/config.yml` (default) or the path passed via `--config`.

### Top-Level Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `version` | `number` | No | `1` | Config schema version |
| `mode` | `"current" \| "remote"` | **Yes** | — | Operating mode |
| `project` | `Project` | **Yes** | — | Project metadata |
| `output` | `Output` | No | See below | Output settings |
| `generation` | `Generation` | No | See below | AI generation settings |
| `types` | `Record<string, TypeConfig>` | No | `{}` | Per-type overrides for default document types |
| `custom_types` | `CustomType[]` | No | `[]` | User-defined document types |
| `exclude` | `string[]` | No | See below | Glob patterns to exclude from AI context |
| `repositories` | `Repository[]` | **Yes** (remote mode) | — | Remote repositories to document |

### `project`

```yaml
project:
  name: "My Project"          # required, non-empty string
  description: "REST API..."  # optional
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | **Yes** | Project display name |
| `description` | `string` | No | Short description passed as context to the AI |

### `output`

```yaml
output:
  directory: "docs/"              # default: "docs/"
  filename_template: "{slug}.md"  # default: "{slug}.md"
  toc: true                       # default: true
  branch: "docs"                  # optional: write docs to a separate branch
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `directory` | `string` | No | `"docs/"` | Output directory, relative to the project root |
| `filename_template` | `string` | No | `"{slug}.md"` | Template for output filenames; `{slug}` is replaced with the document type slug. Must not contain `..` or start with `/` |
| `toc` | `boolean` | No | `true` | Whether to include a table of contents (passed as instruction to the AI) |
| `branch` | `string` | No | — | Git branch to write docs to (optional) |

### `generation`

```yaml
generation:
  provider: "anthropic"   # "anthropic" | "copilot"
  model: "claude-sonnet-4-6"
  cost_limit: null        # number (USD) or null
  timeout: 3600           # seconds per agent run
  parallel: 10            # concurrent document generations
  copilot_byok:           # optional, Copilot only
    type: "openai"        # "openai" | "azure" | "anthropic"
    base_url: "https://..."
    api_key: "sk-..."     # optional if auth is ambient
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `provider` | `"anthropic" \| "copilot"` | No | `"anthropic"` | AI provider |
| `model` | `string` | No | `"claude-sonnet-4-6"` (Anthropic) / `"gpt-4.1"` (Copilot) | Model identifier |
| `cost_limit` | `number \| null` | No | `null` | USD cost limit per `generate` run; `null` means no limit |
| `timeout` | `number` | No | `3600` | Per-document agent timeout in seconds |
| `parallel` | `integer` | No | `10` | Maximum concurrent document generation tasks |
| `copilot_byok` | `ByokConfig` | No | — | BYOK configuration for the Copilot provider |

**`copilot_byok` sub-fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"openai" \| "azure" \| "anthropic"` | **Yes** | LLM API protocol |
| `base_url` | `string` | **Yes** | Base URL of the LLM API endpoint |
| `api_key` | `string` | No | API key; omit if using ambient credentials |

### `types`

Per-type overrides for default document types, keyed by slug.

```yaml
types:
  product-overview:
    enabled: true
  architecture:
    enabled: true
    prompt: |
      Focus on microservices communication patterns.
  api-reference:
    enabled: false
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | `boolean` | **Yes** | Whether this type is active |
| `name` | `string` | No | Override the display name |
| `prompt` | `string` | No | Additional instructions appended to the system prompt for this type |
| `model` | `string` | No | Override the model for this specific type |

### `custom_types`

```yaml
custom_types:
  - slug: "runbook"
    name: "Runbook"
    description: "Step-by-step operational runbooks for common tasks"
    prompt: |
      Generate a runbook covering deployment, rollback, and incident response.
      Target audience: on-call engineers.
```

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `slug` | `string` | **Yes** | Lowercase alphanumeric + hyphens only; e.g. `my-doc-type` | Unique identifier and filename base |
| `name` | `string` | **Yes** | Non-empty | Display name |
| `description` | `string` | **Yes** | Non-empty | Short description shown in the UI and passed to the AI |
| `prompt` | `string` | **Yes** | Non-empty | Full generation instructions for the AI agent |

### `repositories` (remote mode)

Each entry must specify **exactly one** of `path`, `url`, or `github`.

```yaml
repositories:
  - path: "../api-service"          # local path, relative to config dir
    name: "API Service"
  - github: "org/repo"              # GitHub shorthand; cloned via HTTPS
    name: "Auth Service"
    ref: "main"                     # optional branch/tag/SHA
  - url: "https://gitlab.com/org/billing.git"
    name: "Billing Service"
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | **Yes** | Display name and state key |
| `path` | `string` | Conditional | Local filesystem path to the repository |
| `url` | `string` | Conditional | Full Git URL (any host) |
| `github` | `string` | Conditional | GitHub shorthand `org/repo` |
| `ref` | `string` | No | Branch, tag, or commit SHA to check out for remote repos |

Remote repos are shallow-cloned and cached in `.onpush/cache/`.

### `exclude`

Glob patterns of files to exclude from the AI agent's context (file reads, code search).

**Default patterns:**

```yaml
exclude:
  - "node_modules/**"
  - "dist/**"
  - "build/**"
  - ".git/**"
  - "**/*.lock"
  - "**/*.min.js"
  - ".env*"
  - "**/credentials*"
  - "**/secrets*"
  - "**/*.pem"
  - "**/*.key"
```

---

## Environment Variables

Environment variables override `config.yml` values but are themselves overridden by CLI flags.

| Variable | Description | Overrides |
|----------|-------------|-----------|
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `COPILOT_GITHUB_TOKEN` | GitHub token for Copilot (highest env priority) | — |
| `GH_TOKEN` | GitHub token for Copilot (second priority) | — |
| `GITHUB_TOKEN` | GitHub token for Copilot and private repo cloning | — |
| `ONPUSH_PROVIDER` | AI provider: `anthropic` or `copilot` | `generation.provider` |
| `ONPUSH_MODEL` | Model identifier | `generation.model` |
| `ONPUSH_OUTPUT_DIR` | Output directory path | `output.directory` |
| `ONPUSH_COST_LIMIT` | Cost limit in USD (parsed as float) | `generation.cost_limit` |
| `ONPUSH_BYOK_TYPE` | BYOK type: `openai`, `azure`, or `anthropic` (Copilot only) | `generation.copilot_byok.type` |
| `ONPUSH_BYOK_BASE_URL` | BYOK API base URL (Copilot only) | `generation.copilot_byok.base_url` |
| `ONPUSH_BYOK_API_KEY` | BYOK API key (Copilot only) | `generation.copilot_byok.api_key` |
| `CI` | Set to `"true"` or `"1"` to auto-enable CI mode | `--ci` flag |

---

## JSON Output Schema

When `--json` is passed (or CI mode is active), `onpush generate` writes a JSON object to stdout. The schema is defined in `src/cli/commands/json-output.ts`.

```typescript
interface JsonOutput {
  success: boolean;
  type: "full" | "incremental";
  model: string;
  repositories: Record<string, {
    fromSha?: string;
    toSha: string;
    changed: boolean;
  }>;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  durationMs: number;
  documentsUpdated: string[];   // slugs of generated/updated docs
  documentsSkipped: string[];   // slugs of skipped docs
  documents: Array<{
    slug: string;
    name: string;
    status: "generated" | "updated" | "skipped" | "failed";
    version?: number;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    outputPath?: string;        // absolute path to written file
    error?: string;             // present only when status === "failed"
  }>;
  errors: string[];             // "<slug>: <message>" for failed docs
}
```

**Example output**

```json
{
  "success": true,
  "type": "full",
  "model": "claude-sonnet-4-6",
  "repositories": {
    "my-project": {
      "toSha": "a1b2c3d",
      "changed": true
    }
  },
  "totalCostUsd": 0.2341,
  "totalInputTokens": 12400,
  "totalOutputTokens": 5300,
  "durationMs": 34200,
  "documentsUpdated": ["product-overview", "architecture", "api-reference"],
  "documentsSkipped": [],
  "documents": [
    {
      "slug": "product-overview",
      "name": "Product Overview",
      "status": "generated",
      "costUsd": 0.0412,
      "inputTokens": 2100,
      "outputTokens": 980,
      "durationMs": 8100,
      "outputPath": "/home/user/project/docs/product-overview.md"
    }
  ],
  "errors": []
}
```

---

## State File Schema

OnPush stores incremental state in `.onpush/state.json`. This file is managed automatically — consumers should treat it as read-only. It is safe to delete (equivalent to `onpush clean`).

```typescript
interface OnPushState {
  version: number;                              // always 1
  mode: "current" | "remote";
  lastGeneration: {
    timestamp: string;                          // ISO 8601
    type: "full" | "incremental";
    model: string;
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    durationMs: number;
  } | null;
  repositories: Record<string, {
    lastCommitSha: string;
    lastAnalyzedAt: string;                     // ISO 8601
  }>;
  documents: Record<string, {
    version: number;                            // increments on each update
    lastGeneratedAt: string;                    // ISO 8601
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  history: Array<{
    timestamp: string;                          // ISO 8601
    type: "full" | "incremental";
    documentsUpdated: string[];
    totalCostUsd: number;
    totalInputTokens?: number;
    totalOutputTokens?: number;
    durationMs: number;
  }>;                                           // capped at 100 entries
}
```

The file is written atomically (write-to-temp then rename) and uses an advisory directory lock (`.onpush/state.json.lock`) to prevent concurrent corruption when running parallel pipelines.

---

## Document Frontmatter Schema

Every generated Markdown file starts with a YAML frontmatter block:

```yaml
---
title: API / SDK Reference
generated_by: onpush
generated_at: "2026-03-28T14:32:00.000Z"
version: 3
model: claude-sonnet-4-6
---
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Document type display name |
| `generated_by` | `"onpush"` | Always `"onpush"` |
| `generated_at` | `string` (ISO 8601) | UTC timestamp of generation |
| `version` | `integer` | Increments on each regeneration; starts at `1` |
| `model` | `string` | AI model used for this document |

When `--single-file` is used, all documents are merged into `complete-documentation.md` with `title: "Complete Documentation"` and `version: 1`.

---

## Data Models

### Default Document Types

| Slug | Name | Default Enabled |
|------|------|:--------------:|
| `product-overview` | Product Overview | ✅ |
| `architecture` | Architecture / System Design Document | ✅ |
| `api-reference` | API / SDK Reference | ✅ |
| `business-overview` | Business Overview | ✅ |
| `security` | Security | ✅ |
| `testing` | Testing | ✅ |
| `data-model` | Data Model | ❌ |
| `deployment` | Deployment and Operations | ❌ |
| `known-issues` | Known Issues and Technical Debt | ❌ |

### `ResolvedRepo`

Internal model representing a repository available to the AI agent.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Display name |
| `localPath` | `string` | Absolute path to the local checkout |
| `type` | `"local" \| "cloned"` | Whether this repo is in-place or a cached clone |
| `headSha` | `string` | Current HEAD commit SHA |

### `AuthResult`

Internal model carrying resolved credentials.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"api_key" \| "env" \| "claude_code" \| "github_token" \| "github_env" \| "github_cli"` | How auth was resolved |
| `provider` | `"anthropic" \| "copilot"` | Target provider |
| `apiKey` | `string?` | Anthropic API key (if resolved) |
| `githubToken` | `string?` | GitHub token (if resolved) |

---

## Error Handling & Exit Codes

### Exit Codes

| Code | Constant | Meaning |
|------|----------|---------|
| `0` | `Success` | All documents generated or up-to-date |
| `1` | `Fatal` | Unrecoverable error (config not found, auth failure, invalid arguments) |
| `2` | `PartialFailure` | One or more documents failed; others may have succeeded |
| `3` | `CostLimitExceeded` | Accumulated cost exceeded `--cost-limit`; in-flight generations are cancelled and remaining types are skipped |

### Error Types

These error classes are used internally and appear in `--json` output as human-readable messages.

| Class | When thrown |
|-------|-------------|
| `ConfigError` | `config.yml` not found, invalid YAML, or failed Zod validation |
| `AuthError` | Authentication credentials could not be resolved or are invalid |
| `GenerationError` | Agent-level failure during document generation (includes document `slug`) |
| `CostLimitError` | Running cost exceeds the configured limit; carries `currentCost` and `limit` |
| `CancelError` | User cancelled an interactive prompt (`init`, `deinit`, `types`) |

### Retry behaviour

Each document generation attempt is retried **once** on failure with a 2-second backoff. After the single retry is exhausted the document is marked `"failed"` and the run continues with remaining types (exit code `2`).

### State lock errors

If `.onpush/state.json.lock` exists from a crashed previous run, the lock is treated as stale after **30 seconds** and automatically removed. If the lock cannot be acquired within **10 seconds**, the command exits with a descriptive error message asking the user to remove the lock directory manually.

---

## Rate Limiting & Quotas

OnPush itself imposes no rate limits. Quota enforcement is delegated entirely to the upstream provider (Anthropic or GitHub Copilot). To avoid runaway spend:

- Set `generation.cost_limit` in `config.yml` or `--cost-limit` on the CLI. Generation is aborted as soon as the cumulative cost of completed documents exceeds the threshold.
- Set `generation.timeout` (default: `3600` seconds) to cap the wall-clock time for any single agent run.
- Set `generation.parallel` (default: `10`) to control the maximum number of concurrent API calls.

If the upstream API returns rate-limit errors, those surface as `GenerationError` and trigger the one-retry mechanism described above. Persistent rate-limiting will cause affected documents to be marked `"failed"` with exit code `2`.

