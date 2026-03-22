import { buildSystemPrompt, buildTriagePrompt } from "../prompts/system.js";
import type { DocumentType, OnPushConfig } from "../../core/document-types.js";
import type { ResolvedRepo, RepoChangeSet } from "../../repos/manager.js";

function makeConfig(overrides: Partial<OnPushConfig> = {}): OnPushConfig {
  return {
    version: 1,
    mode: "current",
    project: { name: "Test Project", description: "A test project" },
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

function makeRepo(name: string, localPath: string): ResolvedRepo {
  return { name, localPath, type: "local", headSha: "abc123" };
}

function makeDocType(overrides: Partial<DocumentType> = {}): DocumentType {
  return {
    slug: "architecture",
    name: "Architecture",
    description: "System architecture",
    enabled: true,
    ...overrides,
  };
}

describe("buildSystemPrompt", () => {
  it("includes project name", () => {
    const result = buildSystemPrompt({
      docType: makeDocType(),
      config: makeConfig(),
      repos: [makeRepo("main", "/repo")],
      isIncremental: false,
    });
    expect(result).toContain("Test Project");
  });

  it("includes project description", () => {
    const result = buildSystemPrompt({
      docType: makeDocType(),
      config: makeConfig({ project: { name: "Test", description: "My cool project" } }),
      repos: [makeRepo("main", "/repo")],
      isIncremental: false,
    });
    expect(result).toContain("My cool project");
  });

  it("includes single repo path for single-repo config", () => {
    const result = buildSystemPrompt({
      docType: makeDocType(),
      config: makeConfig(),
      repos: [makeRepo("main", "/my/repo")],
      isIncremental: false,
    });
    expect(result).toContain("/my/repo");
    expect(result).toContain("## Repository");
  });

  it("lists all repos for multi-repo config", () => {
    const result = buildSystemPrompt({
      docType: makeDocType(),
      config: makeConfig(),
      repos: [
        makeRepo("frontend", "/repos/frontend"),
        makeRepo("backend", "/repos/backend"),
      ],
      isIncremental: false,
    });
    expect(result).toContain("## Repositories");
    expect(result).toContain("frontend");
    expect(result).toContain("backend");
  });

  it("includes per-type prompt for built-in types", () => {
    const result = buildSystemPrompt({
      docType: makeDocType({ slug: "architecture" }),
      config: makeConfig(),
      repos: [makeRepo("main", "/repo")],
      isIncremental: false,
    });
    // Architecture prompt should contain architecture-related instructions
    expect(result).toContain("Architecture");
  });

  it("uses description for custom types not in PROMPT_MAP", () => {
    const result = buildSystemPrompt({
      docType: makeDocType({
        slug: "custom-guide",
        name: "Custom Guide",
        description: "A custom documentation guide",
      }),
      config: makeConfig(),
      repos: [makeRepo("main", "/repo")],
      isIncremental: false,
    });
    expect(result).toContain("Document Type: Custom Guide");
    expect(result).toContain("A custom documentation guide");
  });

  it("includes custom user prompt from docType.prompt", () => {
    const result = buildSystemPrompt({
      docType: makeDocType({ prompt: "Focus on microservices architecture" }),
      config: makeConfig(),
      repos: [makeRepo("main", "/repo")],
      isIncremental: false,
    });
    expect(result).toContain("## Additional Instructions");
    expect(result).toContain("Focus on microservices architecture");
  });

  it("does not include Additional Instructions when no custom prompt", () => {
    const result = buildSystemPrompt({
      docType: makeDocType({ prompt: undefined }),
      config: makeConfig(),
      repos: [makeRepo("main", "/repo")],
      isIncremental: false,
    });
    expect(result).not.toContain("## Additional Instructions");
  });

  it("includes TOC instruction when toc is true", () => {
    const result = buildSystemPrompt({
      docType: makeDocType(),
      config: makeConfig({ output: { directory: "docs/", filename_template: "{slug}.md", toc: true } }),
      repos: [makeRepo("main", "/repo")],
      isIncremental: false,
    });
    expect(result).toContain("table of contents");
  });

  it("does not include TOC instruction when toc is false", () => {
    const result = buildSystemPrompt({
      docType: makeDocType(),
      config: makeConfig({ output: { directory: "docs/", filename_template: "{slug}.md", toc: false } }),
      repos: [makeRepo("main", "/repo")],
      isIncremental: false,
    });
    expect(result).not.toContain("Include a table of contents at the beginning");
  });

  it("includes incremental mode sections when applicable", () => {
    const repoChanges: RepoChangeSet[] = [
      {
        repo: makeRepo("main", "/repo"),
        hasChanges: true,
        fromSha: "old-sha",
        toSha: "new-sha",
      },
    ];
    const result = buildSystemPrompt({
      docType: makeDocType(),
      config: makeConfig(),
      repos: [makeRepo("main", "/repo")],
      isIncremental: true,
      existingContent: "# Existing\n\nOld content here",
      repoChanges,
    });
    expect(result).toContain("## Incremental Update Mode");
    expect(result).toContain("old-sha");
    expect(result).toContain("new-sha");
    expect(result).toContain("# Existing");
  });

  it("does not include incremental sections for full generation", () => {
    const result = buildSystemPrompt({
      docType: makeDocType(),
      config: makeConfig(),
      repos: [makeRepo("main", "/repo")],
      isIncremental: false,
    });
    expect(result).not.toContain("## Incremental Update Mode");
  });

  it("includes save_document instruction", () => {
    const result = buildSystemPrompt({
      docType: makeDocType(),
      config: makeConfig(),
      repos: [makeRepo("main", "/repo")],
      isIncremental: false,
    });
    expect(result).toContain("save_document");
  });
});

describe("buildTriagePrompt", () => {
  it("includes project name", () => {
    const result = buildTriagePrompt(
      makeConfig(),
      [makeDocType()],
      [{ repo: makeRepo("main", "/repo"), hasChanges: true, toSha: "sha" }]
    );
    expect(result).toContain("Test Project");
  });

  it("lists enabled types with slug, name, and description", () => {
    const types: DocumentType[] = [
      makeDocType({ slug: "architecture", name: "Architecture", description: "System arch" }),
      makeDocType({ slug: "security", name: "Security", description: "Security docs" }),
    ];
    const result = buildTriagePrompt(
      makeConfig(),
      types,
      [{ repo: makeRepo("main", "/repo"), hasChanges: true, toSha: "sha" }]
    );
    expect(result).toContain("architecture: Architecture");
    expect(result).toContain("security: Security");
  });

  it("lists changed repos with SHA ranges", () => {
    const changes: RepoChangeSet[] = [
      {
        repo: makeRepo("frontend", "/repos/frontend"),
        hasChanges: true,
        fromSha: "old",
        toSha: "new",
      },
    ];
    const result = buildTriagePrompt(makeConfig(), [makeDocType()], changes);
    expect(result).toContain("frontend");
    expect(result).toContain("old");
    expect(result).toContain("new");
  });

  it("shows (new) for repos with no fromSha", () => {
    const changes: RepoChangeSet[] = [
      {
        repo: makeRepo("new-repo", "/repos/new"),
        hasChanges: true,
        toSha: "sha123",
      },
    ];
    const result = buildTriagePrompt(makeConfig(), [makeDocType()], changes);
    expect(result).toContain("(new)");
  });

  it("includes JSON array instruction", () => {
    const result = buildTriagePrompt(
      makeConfig(),
      [makeDocType()],
      [{ repo: makeRepo("main", "/repo"), hasChanges: true, toSha: "sha" }]
    );
    expect(result).toContain("JSON array");
  });

  it("only lists repos with changes", () => {
    const changes: RepoChangeSet[] = [
      {
        repo: makeRepo("changed", "/repos/changed"),
        hasChanges: true,
        fromSha: "old",
        toSha: "new",
      },
      {
        repo: makeRepo("unchanged", "/repos/unchanged"),
        hasChanges: false,
        fromSha: "same",
        toSha: "same",
      },
    ];
    const result = buildTriagePrompt(makeConfig(), [makeDocType()], changes);
    expect(result).toContain("changed");
    expect(result).not.toContain("unchanged");
  });
});
