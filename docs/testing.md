---
title: Testing
generated_by: onpush
generated_at: 2026-03-28T22:20:41.033Z
version: 1
model: claude-sonnet-4-6
---

# Testing

## Table of Contents

- [Testing Strategy](#testing-strategy)
- [Test Frameworks & Tools](#test-frameworks--tools)
- [Test Organization](#test-organization)
- [Unit Tests](#unit-tests)
  - [Core Module Tests](#core-module-tests)
  - [Git Module Tests](#git-module-tests)
  - [Output Module Tests](#output-module-tests)
  - [Generation Module Tests](#generation-module-tests)
  - [Repos Module Tests](#repos-module-tests)
  - [CLI Command Tests](#cli-command-tests)
- [Mocking Strategies](#mocking-strategies)
- [Test Data & Fixtures](#test-data--fixtures)
- [CI/CD Integration](#cicd-integration)
- [Coverage & Quality Gates](#coverage--quality-gates)

---

## Testing Strategy

onpush-cli uses a **pure unit testing** strategy. Every module is tested in isolation using mocks to prevent any real filesystem access, git operations, or network calls from occurring. There are no integration tests, end-to-end tests, or manual test suites — the project relies entirely on fast, hermetic unit tests to verify correctness.

The test suite focuses on:

- **Behavioural correctness** — verifying that functions return the right values and call dependencies with the right arguments.
- **Error handling** — ensuring that invalid inputs, filesystem errors, and schema violations throw the expected typed errors with meaningful messages.
- **Security invariants** — confirming that path traversal, unsafe Git URLs, and malformed refs are blocked.
- **Schema validation** — exercising Zod parse/default logic for configuration and state schemas.

---

## Test Frameworks & Tools

| Tool | Role |
|---|---|
| [Vitest](https://vitest.dev/) `^3.1.2` | Test runner, test framework, and assertion library |
| `@vitest/coverage-v8` `^3.2.4` | Code coverage via V8 (built into Node.js) |
| `vitest/globals` | `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `vi` are available globally without imports |
| TypeScript `^5.8.3` | All test files are written in TypeScript |
| ESLint + `typescript-eslint` | Static analysis and linting of source and test code |

There is no separate assertion library; Vitest's built-in `expect` API is used throughout. Mocking is done exclusively with `vi.mock` and `vi.fn`.

Run the tests:

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run with coverage reporting
npm run coverage
```

---

## Test Organization

Tests live alongside the source modules they cover, nested inside `__tests__` subdirectories:

```
src/
├── cli/
│   └── commands/
│       └── __tests__/
│           └── json-output.test.ts
├── core/
│   └── __tests__/
│       ├── auth.test.ts
│       ├── config.test.ts
│       ├── document-types.test.ts
│       ├── env.test.ts
│       ├── errors.test.ts
│       └── state.test.ts
├── generation/
│   └── __tests__/
│   │   ├── cost.test.ts
│   │   └── prompts-system.test.ts
│   └── providers/
│       └── __tests__/
│           ├── index.test.ts
│           └── types.test.ts
├── git/
│   └── __tests__/
│       ├── diff.test.ts
│       ├── files.test.ts
│       └── history.test.ts
├── output/
│   └── __tests__/
│       ├── frontmatter.test.ts
│       ├── merger.test.ts
│       └── writer.test.ts
└── repos/
    └── __tests__/
        ├── local.test.ts
        ├── manager.test.ts
        └── remote.test.ts
```

**Naming conventions:**

- Test files use the `.test.ts` suffix.
- Test files are named after the source file they test (e.g., `config.ts` → `config.test.ts`).
- Vitest is configured to discover tests only via the glob `src/**/__tests__/**/*.test.ts` (see `vitest.config.ts`).

**Vitest configuration** (`vitest.config.ts`):

```ts
export default defineConfig({
  test: {
    globals: true,           // No need to import describe/it/expect
    environment: "node",     // Runs in a Node.js environment
    include: ["src/**/__tests__/**/*.test.ts"],
    mockReset: true,         // Reset mock state between tests
    restoreMocks: true,      // Restore original implementations after each test
  },
});
```

The `mockReset: true` and `restoreMocks: true` settings ensure clean mock state between every test without needing manual `vi.resetAllMocks()` calls in `beforeEach` hooks.

---

## Unit Tests

### Core Module Tests

**`src/core/__tests__/config.test.ts`** — Tests `loadConfig` and `saveConfig` against a mocked `node:fs/promises`. Covers:

- Config resolution paths (absolute, relative, default)
- YAML parsing errors and ENOENT handling → `ConfigError`
- Zod schema defaults (e.g., default `provider`, `model`, `timeout`, `parallel`)
- Validation rejections: missing `project.name`, invalid `mode`, empty `repositories`, path-traversal `filename_template`, uppercase custom type slugs, invalid `provider` enum

**`src/core/__tests__/auth.test.ts`** — Tests auth resolution logic. Covers:

- Anthropic: flag → env (`ANTHROPIC_API_KEY`) → claude_code fallback priority
- Copilot: flag → `COPILOT_GITHUB_TOKEN` → `GH_TOKEN` → `GITHUB_TOKEN` → github_cli fallback priority
- `getAgentEnv` mapping auth objects to environment variable maps

**`src/core/__tests__/errors.test.ts`** — Tests custom error classes (`ConfigError`, `AuthError`, `GenerationError`, `CostLimitError`). Verifies name, message, custom properties, `instanceof Error`, and cost formatting.

**`src/core/__tests__/state.test.ts`** — Tests state persistence. Covers:

- `loadState`: null on ENOENT, re-throw on permission error, parse error on invalid JSON, Zod defaults for minimal state
- `saveState`: atomic write-then-rename pattern (writes to `.tmp` then renames), `mkdir` with `recursive: true`, pretty-printed JSON with trailing newline
- `updateDocumentState`: version increment, ISO timestamp, cost and token storage — uses `vi.useFakeTimers()` for deterministic timestamps
- `appendHistory`: prepend (reverse-chronological) ordering

**`src/core/__tests__/document-types.test.ts`** — Tests document type resolution. Covers defaults (9 types, 6 enabled), type override by slug (name, prompt, model, enabled flag), custom type appending, and `getTypeBySlug` lookup.

**`src/core/__tests__/env.test.ts`** — Tests `resolveEnvOverrides` for all `ONPUSH_*` environment variables: provider, model, cost limit (numeric parse), output dir, CI detection, and BYOK configuration.

### Git Module Tests

**`src/git/__tests__/diff.test.ts`** — Tests `getDiffSummary` and `getDiffText` with a mocked `simple-git` instance. Verifies field mapping, SHA argument passing, and binary file handling.

**`src/git/__tests__/files.test.ts`** — Tests `isGitRepo` and `listTrackedFiles`. Covers:

- Empty output, whitespace trimming, empty-line filtering
- Glob pattern exclusion via `minimatch` (e.g., `node_modules/**`, `*.lock`, `.env*`)
- Multiple simultaneous exclude patterns

**`src/git/__tests__/history.test.ts`** — Tests `getHeadSha` (trimming) and `getCommitCount` (argument passing, total extraction) with a mocked `simple-git`.

### Output Module Tests

**`src/output/__tests__/frontmatter.test.ts`** — Tests YAML frontmatter generation and parsing. Covers YAML block delimiters, required fields (`title`, `generated_by`, `version`, `model`), `generatedAt` defaulting to `Date.now()` via fake timers, parse with/without frontmatter, and a generate→parse roundtrip.

**`src/output/__tests__/merger.test.ts`** — Tests `mergeDocuments`. Covers:

- Canonical sort order (`DOCUMENT_TYPE_ORDER`) for built-in types
- Alphabetical sort for custom types placed after built-ins
- TOC link generation
- Horizontal rule separation between documents (`---`)
- Frontmatter inclusion (`title: Complete Documentation`, `model`)
- Uses `vi.useFakeTimers()` for stable timestamps

**`src/output/__tests__/writer.test.ts`** — Tests `writeDocument`. Covers:

- Frontmatter prepended to content
- `{slug}` interpolation in `filename_template`
- Parent directory creation
- Trailing newline enforcement
- Path traversal detection for `../evil` slugs and absolute template paths
- Nested `filename_template` paths (e.g., `sub/{slug}.md`)

### Generation Module Tests

**`src/generation/__tests__/cost.test.ts`** — Tests the `CostTracker` class. Covers:

- `getTotalCost`: zero initial, single, accumulated (floating point via `toBeCloseTo`)
- `isOverLimit`: null (no limit), under, over, exact boundary (strict `>`)
- `getSummary`: zero totals, summed totals, copy semantics, per-document data

**`src/generation/__tests__/prompts-system.test.ts`** — Tests `buildSystemPrompt` and `buildTriagePrompt`. Covers:

- Project name and description inclusion
- Single vs. multi-repo formatting (section heading changes)
- Built-in type prompt selection vs. custom type description fallback
- Custom prompt injection under `## Additional Instructions`
- TOC instruction toggling
- Incremental mode section (SHA ranges, existing content) vs. full generation
- `save_document` tool instruction presence
- Triage prompt: document type listing, SHA range formatting, `(new)` label, changed-only repo filtering, JSON array instruction

**`src/generation/providers/__tests__/index.test.ts`** — Tests `createProvider` factory. Verifies correct dispatch for `"anthropic"` and `"copilot"` providers, and rejection of unknown provider names.

**`src/generation/providers/__tests__/types.test.ts`** — Tests the `DEFAULT_MODELS` constant for expected model names per provider.

### Repos Module Tests

**`src/repos/__tests__/local.test.ts`** — Tests `resolveLocalRepo` with mocked `isGitRepo` and `getHeadSha`. Covers relative path resolution, correct `ResolvedRepo` structure, and the "Not a git repository" error.

**`src/repos/__tests__/manager.test.ts`** — Tests `slugify`, `getRepoChanges`, and `resolveRepos`. Covers:

- Slug normalization (lowercase, hyphenation, deduplication)
- Change detection against state (new repo, SHA change, SHA match, null state)
- `current` mode repo resolution (parent dir, explicit path, non-git error)
- `remote` mode with local paths and GitHub shorthand, including cloned placeholder and empty-repositories error

**`src/repos/__tests__/remote.test.ts`** — Tests `resolveGitUrl`, `sanitizeDirName`, and `cloneOrUpdate`. Covers:

- GitHub shorthand to full URL conversion
- Protocol allowlist (https, git@, ssh://, http://) and denylist (file://, ftp://, ext::)
- Directory name sanitization (strip protocol/suffix, replace special chars, collapse hyphens, lowercase)
- Clone path when directory absent, fetch+pull path when directory exists
- Full clone (no `--depth 1`) for incremental support
- `--branch` argument for specified refs
- Unsafe ref injection prevention (e.g., `; rm -rf /`)

### CLI Command Tests

**`src/cli/commands/__tests__/json-output.test.ts`** — Tests `formatJsonOutput`. Covers:

- `success` flag based on document failure presence
- Categorisation into `documentsUpdated`, `documentsSkipped`, `errors`
- Repository SHA and `changed` field pass-through
- Repo name slugification as object keys
- `outputPath` from the `outputPaths` map
- Cost, token, and duration pass-through
- Mixed status handling

---

## Mocking Strategies

All external I/O is mocked. Three patterns are used:

### 1. Module-level `vi.mock` for Node built-ins

Used when the module under test imports `node:fs/promises` directly. The mock must be declared before the import that depends on it.

```ts
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
}));

// Dynamic import AFTER mock setup to get the mocked reference
const { readFile, writeFile } = await import("node:fs/promises");
```

### 2. Module-level `vi.mock` for `simple-git`

Used in all git module tests. A mock `git` object is defined in the test scope, and `simpleGit` is mocked to return it.

```ts
const mockGit = {
  diffSummary: vi.fn(),
  diff: vi.fn(),
};

vi.mock("simple-git", () => ({
  simpleGit: vi.fn(() => mockGit),
}));
```

Test cases then configure the mock's return value per scenario:

```ts
mockGit.diffSummary.mockResolvedValue({ changed: 3, insertions: 50, ... });
```

### 3. Cross-module `vi.mock` for internal dependencies

Used in higher-level tests (e.g., `manager.test.ts`, `local.test.ts`) to mock sibling modules like `../../git/files.js` or `../remote.js`.

```ts
vi.mock("../local.js", () => ({
  resolveLocalRepo: vi.fn().mockResolvedValue({
    name: "local-repo",
    localPath: "/resolved/path",
    type: "local",
    headSha: "local-sha",
  }),
}));

// Retrieve the mock reference after setup
const { isGitRepo } = await import("../../git/files.js");
```

### Timer Mocking

Tests that depend on `Date.now()` or `new Date()` use Vitest's fake timers to produce deterministic timestamps:

```ts
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});
```

This pattern appears in `state.test.ts`, `frontmatter.test.ts`, and `merger.test.ts`.

### Environment Variables

Tests that depend on `process.env` values use `beforeEach` to delete relevant keys and restore a clean environment:

```ts
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.COPILOT_GITHUB_TOKEN;
});
```

---

## Test Data & Fixtures

The project does not use external fixture files. Test data is constructed inline using **factory functions** defined at the top of each test file. These functions accept `Partial<T>` overrides to enable targeted variation while keeping defaults concise.

**Example factory pattern:**

```ts
function makeConfig(overrides: Partial<OnPushConfig> = {}): OnPushConfig {
  return {
    version: 1,
    mode: "current",
    project: { name: "Test Project" },
    output: { directory: "docs/", filename_template: "{slug}.md", toc: true },
    generation: {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      cost_limit: null,
      timeout: 3600,
      parallel: 10,
    },
    types: {},
    custom_types: [],
    exclude: [],
    ...overrides,
  };
}
```

This pattern is used across `config.test.ts`, `document-types.test.ts`, `prompts-system.test.ts`, `manager.test.ts`, and `json-output.test.ts`, ensuring consistent baseline objects with per-test customisation. Raw YAML and JSON strings are used as inline literals when testing parsers.

---

## CI/CD Integration

Two GitHub Actions workflows run tests.

### Pull Request Workflow (`.github/workflows/pr.yml`)

Triggered on every pull request. Runs the full test suite with coverage reporting.

```
Checkout → Setup Node 24 → npm ci → npm run build → npm run coverage → Coveralls report → PR coverage comment
```

- Coverage is reported to [Coveralls](https://coveralls.io) via `coverallsapp/github-action@v2`.
- A sticky coverage summary comment is posted on the PR using `marocchino/sticky-pull-request-comment@v2`. The comment is skipped for fork PRs (where secrets are unavailable).
- The Istanbul text report (`./coverage/report.txt`) is embedded directly in the PR comment after stripping separator lines.

### Branch Push Workflow (`.github/workflows/coverage.yml`)

Triggered on pushes to `main` and `next`. Runs coverage and reports to Coveralls to maintain the badge and trend data.

```
Checkout → Setup Node 24 → npm ci → npm run coverage → Coveralls report
```

### Publish Workflow (`.github/workflows/publish.yml`)

Triggered on pushes to `main`. Does not run tests but does run `npm run build`, which depends on TypeScript compilation. Type errors will fail the build.

---

## Coverage & Quality Gates

### Coverage

The `coverage` script runs Vitest with V8 coverage and outputs a JSON summary:

```bash
vitest run --coverage --reporter=json --outputFile=./test-output.json
```

Coverage data is written to `./coverage/` and reported via the Coveralls integration on every PR and push to main/next. There is no hard-coded threshold that blocks CI — coverage is tracked as a trend metric rather than an enforced gate.

### Type Checking

TypeScript strict mode is enabled in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true
  }
}
```

The `lint` script combines type checking with ESLint:

```bash
tsc --noEmit && eslint src/
```

Test files are excluded from compilation (`"exclude": ["src/**/__tests__"]` in `tsconfig.json`) but are still linted.

### ESLint Rules (`eslint.config.js`)

The project uses `@eslint/js` recommended rules plus `typescript-eslint` recommended rules, with two customisations:

| Rule | Level | Note |
|---|---|---|
| `@typescript-eslint/no-unused-vars` | `warn` | Ignores `_`-prefixed identifiers |
| `@typescript-eslint/no-explicit-any` | `warn` | Discourages untyped `any` usage |

`dist/`, `node_modules/`, and `scripts/` are excluded from linting.

