# OnPush

[![npm version](https://img.shields.io/npm/v/onpush)](https://www.npmjs.com/package/onpush) [![Coverage Status](https://coveralls.io/repos/github/gnk-softworks/onpush-cli/badge.svg?branch=main)](https://coveralls.io/github/gnk-softworks/onpush-cli?branch=main)

Software documentation generator powered by either Claude Code or GitHub Copilot agents. OnPush autonomously explores your codebase, produces and maintains comprehensive Markdown docs.

## How It Works

OnPush is designed to be used in the terminal or as part of a CI pipeline. It uses either the Claude Agent SDK or GitHub Copilot SDK to launch AI agents that autonomously explore your codebase using file reading, code search, git history, and web tools. The tool then produces or updates comprehensive Markdown documentation.

When running locally you can either utilise your Claude or Copilot Subscriptions or use API keys to generate documentation. In CI mode you should use API keys only as anything else is likely against the terms of service for those products.

**Use is at own risk and you should ensure you are complying with the terms of service for any products you use with this tool.**

## Installation

### Prerequisites
- GitHub Copilot CLI or Claude Code - The agent cli you want to use needs to be installed and authenticated.
- node (20+) and npm - OnPush is built with Node.js and distributed via npm.

### Install via npm

```bash
npm install -g onpush-cli
```

### Install from source

```bash
git clone git@github.com:gnk-softworks/onpush-cli.git
cd onpush-cli
npm install
npm run build
npm link
```

## Quick Start

```bash
# Navigate to your project
cd /path/to/your/project

# Initialize
onpush init

# Generate documentation
onpush generate
```

OnPush creates a `.onpush/config.yml` in your project and outputs Markdown files to `docs/`.

## Authentication

### Anthropic (default)

OnPush resolves Anthropic authentication in this order:

1. `--anthropic-api-key` flag
2. `ANTHROPIC_API_KEY` environment variable
3. Claude Code session (if logged in)

### GitHub Copilot

When using `--provider copilot`, authentication is resolved in this order:

1. `--github-token` flag
2. `COPILOT_GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN` environment variables
3. GitHub CLI stored credentials

## Global Options

```
Options:
  --config <path>              Path to config file (default: .onpush/config.yml)
  --anthropic-api-key <key>    Anthropic API key (overrides env var and Claude Code auth)
  --github-token <token>       GitHub token for Copilot provider (overrides env vars)
  --provider <name>            AI provider: anthropic or copilot (overrides config)
  --quiet                      Suppress all output except errors
  --no-color                   Disable colored output
  --ci                         Force CI mode (auto-detected via CI=true env var)
```

## Commands

### `onpush init`

Interactive setup wizard. Creates `.onpush/config.yml`.

- Select AI provider: **Anthropic** or **GitHub Copilot**
- Select AI model (provider-specific presets or custom model name)
- Select mode: **Current Repo** or **Remote Repo(s)**
- Configure project name, output directory, document types
- Create custom document types with guided prompts
- Set parallel generation count

### `onpush generate`

Generate or update documentation.

```
Options:
  --full                  Force full regeneration (ignore incremental)
  --type <slug>           Generate only a specific document type
  --single-file           Merge all docs into a single file
  --model <model>         Override AI model
  --parallel <n>          Run N generations concurrently (default: from config)
  --output <dir>          Override output directory
  --verbose               Show detailed progress
  --json                  Output structured JSON summary
  --cost-limit <usd>      Abort if cost exceeds threshold
  --provider <name>       Override AI provider (anthropic or copilot)
  --byok-type <type>      BYOK provider type: openai, azure, or anthropic (Copilot only)
  --byok-base-url <url>   BYOK base URL for the LLM API (Copilot only)
  --byok-api-key <key>    BYOK API key for the LLM provider (Copilot only)
```

First run performs full generation. Subsequent runs are incremental — the agent analyzes git diffs and only regenerates affected documents.

### `onpush types`

Interactive TUI for managing document types. Toggle defaults on/off, create custom types, or delete custom types.

### `onpush status`

Show current documentation state, last generation info, and repo change status.

### `onpush cost`

Show historical cost data from past generations.

### `onpush clean`

Remove all generated docs and state. Preserves config.

### `onpush deinit`

Interactive removal of OnPush configuration and/or generated docs.

## Document Types

### Default Types

| Type | Default |
|------|---------|
| Product Overview | Enabled |
| Architecture / System Design Document | Enabled |
| API / SDK Reference | Enabled |
| Business Overview | Enabled |
| Security | Enabled |
| Testing | Enabled |
| Data Model | Disabled |
| Deployment and Operations | Disabled |
| Known Issues and Technical Debt | Disabled |

### Custom Types

Define custom document types during `onpush init` or via `onpush types`. The wizard asks for:

- **Name** and **slug**
- **Description** of what the document covers
- **Target audience**
- **Sections to cover**
- **Additional guidance** for the AI

These are assembled into a structured prompt matching the quality of built-in types.

## Operating Modes

### Current Repo

Documents the repository you're in. Docs are stored alongside your code in `docs/` (or on a separate branch).

```
my-project/
├── src/
├── .onpush/
│   ├── config.yml
│   └── state.json
└── docs/
    ├── product-overview.md
    ├── architecture.md
    └── ...
```

### Remote Repo(s)

Documents one or multiple repositories from a dedicated docs location. Repos can be local paths, Git URLs (any host), or GitHub shorthand.

```yaml
repositories:
  - path: "../api-service"
    name: "API Service"
  - github: "org/auth-service"
    name: "Auth Service"
  - url: "https://gitlab.com/org/billing.git"
    name: "Billing Service"
```

Remote repos are shallow-cloned and cached in `.onpush/cache/`.

## Configuration

Config lives at `.onpush/config.yml`:

```yaml
version: 1
mode: current

project:
  name: "My Project"
  description: "REST API for the billing platform"

output:
  directory: "docs/"
  filename_template: "{slug}.md"
  toc: true

generation:
  provider: "anthropic"  # or "copilot"
  model: "claude-opus-4-6"
  cost_limit: null
  timeout: 3600
  parallel: 10
  # copilot_byok:         # Optional, Copilot provider only
  #   type: "openai"
  #   base_url: "https://..."
  #   api_key: "..."

types:
  product-overview:
    enabled: true
  architecture:
    enabled: true
    prompt: |
      Focus on the microservices communication patterns.
  # ...

custom_types:
  - slug: "testing-guide"
    name: "Testing Guide"
    description: "Testing strategy and how to write new tests"
    prompt: |
      Generate a testing strategy document for new developers.
      ...

exclude:
  - "node_modules/**"
  - "dist/**"
  - ".env*"
  - "**/*.key"
```

## CI/CD

### GitHub Actions

An example workflow is included at [`.github/workflows/generate-docs.yml`](.github/workflows/generate-docs.yml). It installs Node, Claude Code, and OnPush, then runs `onpush generate --ci`.

To use it in your own repository, copy the workflow file and add `ANTHROPIC_API_KEY` to your repository secrets.

CI mode is auto-detected via `CI=true` or `--ci` flag. Output switches to JSON with plain text progress.

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Fatal error |
| 2 | Partial failure (some docs failed) |
| 3 | Cost limit exceeded |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `COPILOT_GITHUB_TOKEN` | GitHub token for Copilot provider (highest priority) |
| `GH_TOKEN` | GitHub token for Copilot provider (fallback) |
| `GITHUB_TOKEN` | GitHub token for Copilot provider and cloning private repos |
| `ONPUSH_PROVIDER` | Override AI provider (`anthropic` or `copilot`) |
| `ONPUSH_MODEL` | Override default model |
| `ONPUSH_OUTPUT_DIR` | Override output directory |
| `ONPUSH_COST_LIMIT` | Set cost limit (USD) |
| `ONPUSH_BYOK_TYPE` | BYOK provider type: `openai`, `azure`, or `anthropic` (Copilot only) |
| `ONPUSH_BYOK_BASE_URL` | BYOK API base URL (Copilot only) |
| `ONPUSH_BYOK_API_KEY` | BYOK API key (Copilot only) |
| `CI` | Auto-enables CI mode |

## Community

Join the [OnPush Discord server](https://discord.gg/7F9vad4j) to ask questions, share feedback, and connect with other users and contributors.

## Feature requests and bug reports

If you have a feature request or have found a bug, please create an issue on the  [GitHub repository](https://github.com/gnk-softworks/onpush-cli/issues).

## Contributions

We welcome any contributions from the community to improve the library. Join our [Discord server](https://discord.gg/7F9vad4j) to discuss contributions or get help.

### How to Contribute

1. Find an issue in the issues tab you want to work on or create an issue with a description of the problem or feature you would like to add.
2. The "next" branch is the development branch for the project. Please use this branch as the base for your changes.
3. Make your proposed changes.
4. Ensure change is tested. We would like to maintain a high standard of code quality and reliability, so please include tests for any new features or bug fixes you add.
5. Create a pull request back into the "next" branch.
6. A Maintainer will review your changes and merge them into the "next" branch if approved.
 - Bug Fixes: We will endeavour to approve, merge and release any bug fixes quickly.
 - Features: Before any new feature is merged it must be approved by maintainers in GitHub Issues. We will review and approve features based on their complexity and alignment with the project goals.

### Code of Conduct

Don't be a jerk. We are all here to learn and improve the project. Please be respectful of others and their contributions.

### AI Policy

We welcome contributions that are assisted by AI tools, but please ensure that all code is reviewed and tested by a human before submitting a pull request.

## License

[Elastic License 2.0 (ELv2)](LICENSE)
