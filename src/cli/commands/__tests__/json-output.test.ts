import { formatJsonOutput } from "../json-output.js";
import type { OrchestrationResult, DocumentResult } from "../../../generation/orchestrator.js";
import type { OnPushConfig } from "../../../core/document-types.js";
import type { RepoChangeSet } from "../../../repos/manager.js";

function makeConfig(): OnPushConfig {
  return {
    version: 1,
    mode: "current",
    project: { name: "Test" },
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
  };
}

function makeDocResult(overrides: Partial<DocumentResult> = {}): DocumentResult {
  return {
    slug: "architecture",
    name: "Architecture",
    status: "generated",
    costUsd: 0.05,
    inputTokens: 1000,
    outputTokens: 500,
    durationMs: 5000,
    ...overrides,
  };
}

function makeResult(docs: DocumentResult[]): OrchestrationResult {
  return {
    type: "full",
    model: "claude-sonnet-4-6",
    documents: docs,
    costSummary: {
      totalCostUsd: docs.reduce((s, d) => s + d.costUsd, 0),
      totalInputTokens: docs.reduce((s, d) => s + d.inputTokens, 0),
      totalOutputTokens: docs.reduce((s, d) => s + d.outputTokens, 0),
      totalDurationMs: docs.reduce((s, d) => s + d.durationMs, 0),
      documents: [],
    },
    durationMs: 10000,
  };
}

function makeRepoChange(name: string, hasChanges: boolean): RepoChangeSet {
  return {
    repo: { name, localPath: "/repo", type: "local", headSha: "abc" },
    hasChanges,
    fromSha: "old-sha",
    toSha: "abc",
  };
}

describe("formatJsonOutput", () => {
  it("sets success: true when no documents failed", () => {
    const result = formatJsonOutput(
      makeResult([makeDocResult()]),
      makeConfig(),
      [makeRepoChange("test", true)],
      {}
    );
    expect(result.success).toBe(true);
  });

  it("sets success: false when any document failed", () => {
    const result = formatJsonOutput(
      makeResult([makeDocResult({ status: "failed", error: "boom" })]),
      makeConfig(),
      [makeRepoChange("test", true)],
      {}
    );
    expect(result.success).toBe(false);
  });

  it("categorizes generated/updated docs into documentsUpdated", () => {
    const result = formatJsonOutput(
      makeResult([
        makeDocResult({ slug: "arch", status: "generated" }),
        makeDocResult({ slug: "sec", status: "updated" }),
      ]),
      makeConfig(),
      [makeRepoChange("test", true)],
      {}
    );
    expect(result.documentsUpdated).toEqual(["arch", "sec"]);
  });

  it("categorizes skipped docs into documentsSkipped", () => {
    const result = formatJsonOutput(
      makeResult([makeDocResult({ slug: "arch", status: "skipped" })]),
      makeConfig(),
      [makeRepoChange("test", true)],
      {}
    );
    expect(result.documentsSkipped).toEqual(["arch"]);
  });

  it("collects errors from failed documents", () => {
    const result = formatJsonOutput(
      makeResult([
        makeDocResult({ slug: "arch", status: "failed", error: "timeout" }),
      ]),
      makeConfig(),
      [makeRepoChange("test", true)],
      {}
    );
    expect(result.errors).toEqual(["arch: timeout"]);
  });

  it("slugifies repo names as keys", () => {
    const result = formatJsonOutput(
      makeResult([]),
      makeConfig(),
      [makeRepoChange("My Project", true)],
      {}
    );
    expect(result.repositories["my-project"]).toBeDefined();
  });

  it("includes fromSha, toSha, changed for each repo", () => {
    const result = formatJsonOutput(
      makeResult([]),
      makeConfig(),
      [makeRepoChange("test", true)],
      {}
    );
    const repo = result.repositories["test"];
    expect(repo.fromSha).toBe("old-sha");
    expect(repo.toSha).toBe("abc");
    expect(repo.changed).toBe(true);
  });

  it("includes outputPath from outputPaths map", () => {
    const result = formatJsonOutput(
      makeResult([makeDocResult({ slug: "architecture" })]),
      makeConfig(),
      [makeRepoChange("test", true)],
      { architecture: "/docs/architecture.md" }
    );
    expect(result.documents[0].outputPath).toBe("/docs/architecture.md");
  });

  it("passes through cost/token/duration from result", () => {
    const result = formatJsonOutput(
      makeResult([
        makeDocResult({ costUsd: 0.123, inputTokens: 5000, outputTokens: 2000, durationMs: 8000 }),
      ]),
      makeConfig(),
      [],
      {}
    );
    expect(result.documents[0].costUsd).toBe(0.123);
    expect(result.documents[0].inputTokens).toBe(5000);
    expect(result.documents[0].outputTokens).toBe(2000);
    expect(result.documents[0].durationMs).toBe(8000);
  });

  it("handles empty documents array", () => {
    const result = formatJsonOutput(
      makeResult([]),
      makeConfig(),
      [],
      {}
    );
    expect(result.success).toBe(true);
    expect(result.documentsUpdated).toEqual([]);
    expect(result.documentsSkipped).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("handles mixed statuses", () => {
    const result = formatJsonOutput(
      makeResult([
        makeDocResult({ slug: "arch", status: "generated" }),
        makeDocResult({ slug: "sec", status: "skipped" }),
        makeDocResult({ slug: "api", status: "failed", error: "err" }),
      ]),
      makeConfig(),
      [makeRepoChange("test", true)],
      {}
    );
    expect(result.documentsUpdated).toEqual(["arch"]);
    expect(result.documentsSkipped).toEqual(["sec"]);
    expect(result.errors).toEqual(["api: err"]);
    expect(result.success).toBe(false);
  });
});
