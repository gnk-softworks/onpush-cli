import { vi } from "vitest";
import {
  slugify,
  getRepoChanges,
  resolveRepos,
  type ResolvedRepo,
} from "../manager.js";
import type { OnPushState } from "../../core/state.js";
import type { OnPushConfig } from "../../core/document-types.js";

vi.mock("../local.js", () => ({
  resolveLocalRepo: vi.fn().mockResolvedValue({
    name: "local-repo",
    localPath: "/resolved/path",
    type: "local",
    headSha: "local-sha",
  }),
}));

vi.mock("../remote.js", () => ({
  cloneOrUpdate: vi.fn().mockResolvedValue({
    localPath: "/cache/repo",
    headSha: "remote-sha",
  }),
}));

vi.mock("../../git/history.js", () => ({
  getHeadSha: vi.fn().mockResolvedValue("head-sha-123"),
}));

vi.mock("../../git/files.js", () => ({
  isGitRepo: vi.fn().mockResolvedValue(true),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

const { isGitRepo } = await import("../../git/files.js");

describe("slugify", () => {
  it("lowercases name", () => {
    expect(slugify("My Project")).toBe("my-project");
  });

  it("replaces non-alphanumeric chars with hyphens", () => {
    expect(slugify("hello world!@#")).toBe("hello-world");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("---test---")).toBe("test");
  });

  it("collapses consecutive non-alphanumeric chars", () => {
    expect(slugify("a   b   c")).toBe("a-b-c");
  });

  it("handles already-clean slugs", () => {
    expect(slugify("clean-slug")).toBe("clean-slug");
  });
});

describe("getRepoChanges", () => {
  const makeRepo = (name: string, headSha: string): ResolvedRepo => ({
    name,
    localPath: `/repo/${name}`,
    type: "local",
    headSha,
  });

  it("returns hasChanges: true for new repo not in state", () => {
    const repos = [makeRepo("new-repo", "sha123")];
    const state: OnPushState = {
      version: 1,
      mode: "current",
      lastGeneration: null,
      repositories: {},
      documents: {},
      history: [],
    };
    const changes = getRepoChanges(repos, state);
    expect(changes[0].hasChanges).toBe(true);
    expect(changes[0].toSha).toBe("sha123");
  });

  it("returns hasChanges: true when SHA differs", () => {
    const repos = [makeRepo("repo", "new-sha")];
    const state: OnPushState = {
      version: 1,
      mode: "current",
      lastGeneration: null,
      repositories: {
        repo: { lastCommitSha: "old-sha", lastAnalyzedAt: "2025-01-01" },
      },
      documents: {},
      history: [],
    };
    const changes = getRepoChanges(repos, state);
    expect(changes[0].hasChanges).toBe(true);
    expect(changes[0].fromSha).toBe("old-sha");
    expect(changes[0].toSha).toBe("new-sha");
  });

  it("returns hasChanges: false when SHA matches", () => {
    const repos = [makeRepo("repo", "same-sha")];
    const state: OnPushState = {
      version: 1,
      mode: "current",
      lastGeneration: null,
      repositories: {
        repo: { lastCommitSha: "same-sha", lastAnalyzedAt: "2025-01-01" },
      },
      documents: {},
      history: [],
    };
    const changes = getRepoChanges(repos, state);
    expect(changes[0].hasChanges).toBe(false);
  });

  it("returns all repos with changes when state is null", () => {
    const repos = [makeRepo("repo1", "sha1"), makeRepo("repo2", "sha2")];
    const changes = getRepoChanges(repos, null);
    expect(changes.every((c) => c.hasChanges)).toBe(true);
  });

  it("sets fromSha from state when available", () => {
    const repos = [makeRepo("repo", "new")];
    const state: OnPushState = {
      version: 1,
      mode: "current",
      lastGeneration: null,
      repositories: {
        repo: { lastCommitSha: "old", lastAnalyzedAt: "2025-01-01" },
      },
      documents: {},
      history: [],
    };
    const changes = getRepoChanges(repos, state);
    expect(changes[0].fromSha).toBe("old");
  });

  it("sets fromSha to undefined for new repos", () => {
    const repos = [makeRepo("new-repo", "sha")];
    const changes = getRepoChanges(repos, null);
    expect(changes[0].fromSha).toBeUndefined();
  });
});

describe("resolveRepos", () => {
  const makeConfig = (overrides: Partial<OnPushConfig> = {}): OnPushConfig => ({
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
    ...overrides,
  });

  it("current mode uses parent of config dir as repo path", async () => {
    (isGitRepo as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    const repos = await resolveRepos(
      makeConfig(),
      "/project/.onpush/config.yml"
    );
    expect(repos).toHaveLength(1);
    expect(repos[0].type).toBe("local");
  });

  it("throws when current directory is not a git repo", async () => {
    (isGitRepo as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    await expect(
      resolveRepos(makeConfig(), "/project/.onpush/config.yml")
    ).rejects.toThrow("not a git repository");
  });

  it("current mode with explicit repository path uses resolveLocalRepo", async () => {
    const config = makeConfig({ repository: { path: "../other-repo" } });
    const repos = await resolveRepos(config, "/project/.onpush/config.yml");
    expect(repos).toHaveLength(1);
  });

  it("remote mode creates entries for all repositories", async () => {
    const config = makeConfig({
      mode: "remote",
      repositories: [
        { name: "frontend", path: "/local/frontend" },
        { name: "backend", github: "org/backend" },
      ],
    });
    const repos = await resolveRepos(config, "/project/.onpush/config.yml");
    expect(repos).toHaveLength(2);
  });

  it("remote mode creates cloned placeholder for remote repos", async () => {
    const config = makeConfig({
      mode: "remote",
      repositories: [{ name: "backend", github: "org/backend" }],
    });
    const repos = await resolveRepos(config, "/project/.onpush/config.yml");
    expect(repos[0].type).toBe("cloned");
    expect(repos[0].localPath).toBe(""); // placeholder
  });

  it("throws for remote mode with no repositories", async () => {
    const config = makeConfig({ mode: "remote", repositories: [] });
    await expect(
      resolveRepos(config, "/project/.onpush/config.yml")
    ).rejects.toThrow("at least one repository");
  });
});
