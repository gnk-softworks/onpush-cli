import { vi } from "vitest";
import { resolveGitUrl, sanitizeDirName, cloneOrUpdate } from "../remote.js";

const mockGit = {
  fetch: vi.fn().mockResolvedValue(undefined),
  checkout: vi.fn().mockResolvedValue(undefined),
  pull: vi.fn().mockResolvedValue(undefined),
  clone: vi.fn().mockResolvedValue(undefined),
  revparse: vi.fn().mockResolvedValue("false"),
};

vi.mock("simple-git", () => ({
  simpleGit: vi.fn(() => mockGit),
}));

vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
}));

vi.mock("../../git/history.js", () => ({
  getHeadSha: vi.fn().mockResolvedValue("abc123"),
}));

const { access } = await import("node:fs/promises");
const { getHeadSha } = await import("../../git/history.js");

describe("resolveGitUrl", () => {
  it("converts github shorthand to full URL", () => {
    expect(resolveGitUrl({ github: "org/repo" })).toBe(
      "https://github.com/org/repo.git"
    );
  });

  it("passes through https URL directly", () => {
    expect(resolveGitUrl({ url: "https://github.com/org/repo.git" })).toBe(
      "https://github.com/org/repo.git"
    );
  });

  it("passes through git@ URL directly", () => {
    expect(resolveGitUrl({ url: "git@github.com:org/repo.git" })).toBe(
      "git@github.com:org/repo.git"
    );
  });

  it("passes through ssh:// URL", () => {
    expect(resolveGitUrl({ url: "ssh://git@github.com/org/repo.git" })).toBe(
      "ssh://git@github.com/org/repo.git"
    );
  });

  it("passes through http:// URL", () => {
    expect(resolveGitUrl({ url: "http://github.com/org/repo.git" })).toBe(
      "http://github.com/org/repo.git"
    );
  });

  it("rejects ext:: protocol URL", () => {
    expect(() =>
      resolveGitUrl({ url: 'ext::sh -c "evil"' })
    ).toThrow("Unsupported or unsafe Git URL");
  });

  it("rejects file:// protocol URL", () => {
    expect(() => resolveGitUrl({ url: "file:///tmp/repo" })).toThrow(
      "Unsupported or unsafe Git URL"
    );
  });

  it("rejects ftp:// protocol URL", () => {
    expect(() => resolveGitUrl({ url: "ftp://example.com/repo" })).toThrow(
      "Unsupported or unsafe Git URL"
    );
  });

  it("throws when neither url nor github provided", () => {
    expect(() => resolveGitUrl({})).toThrow(
      "Repository spec must have either url or github"
    );
  });
});

describe("sanitizeDirName", () => {
  it("strips https:// protocol", () => {
    expect(sanitizeDirName("https://github.com/org/repo.git")).not.toContain(
      "https://"
    );
  });

  it("strips .git suffix", () => {
    expect(sanitizeDirName("https://github.com/org/repo.git")).not.toMatch(
      /\.git$/
    );
  });

  it("replaces / : @ with hyphens", () => {
    const result = sanitizeDirName("https://github.com/org/repo.git");
    expect(result).toBe("github.com-org-repo");
  });

  it("collapses consecutive hyphens", () => {
    const result = sanitizeDirName("git@github.com:org/repo.git");
    expect(result).not.toContain("--");
  });

  it("lowercases result", () => {
    const result = sanitizeDirName("https://GitHub.com/Org/Repo.git");
    expect(result).toBe(result.toLowerCase());
  });
});

describe("cloneOrUpdate", () => {
  beforeEach(() => {
    (getHeadSha as ReturnType<typeof vi.fn>).mockResolvedValue("abc123");
    mockGit.revparse.mockResolvedValue("false");
    mockGit.fetch.mockResolvedValue(undefined);
    mockGit.checkout.mockResolvedValue(undefined);
    mockGit.pull.mockResolvedValue(undefined);
    mockGit.clone.mockResolvedValue(undefined);
  });

  it("clones when directory doesn't exist", async () => {
    (access as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ENOENT"));

    const result = await cloneOrUpdate(
      { github: "org/repo", name: "repo" },
      "/cache"
    );

    expect(mockGit.clone).toHaveBeenCalled();
    expect(result.headSha).toBe("abc123");
  });

  it("does not use --depth 1 (full clone for incremental support)", async () => {
    (access as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ENOENT"));

    await cloneOrUpdate({ github: "org/repo", name: "repo" }, "/cache");

    const cloneArgs = mockGit.clone.mock.calls[0];
    expect(cloneArgs[2]).not.toContain("--depth");
  });

  it("adds --branch for specified ref", async () => {
    (access as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ENOENT"));

    await cloneOrUpdate(
      { github: "org/repo", name: "repo", ref: "develop" },
      "/cache"
    );

    const cloneArgs = mockGit.clone.mock.calls[0];
    expect(cloneArgs[2]).toContain("--branch");
    expect(cloneArgs[2]).toContain("develop");
  });

  it("fetches and pulls when directory exists and no ref specified", async () => {
    (access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await cloneOrUpdate({ github: "org/repo", name: "repo" }, "/cache");

    expect(mockGit.fetch).toHaveBeenCalled();
    expect(mockGit.pull).toHaveBeenCalled();
    expect(mockGit.checkout).not.toHaveBeenCalled();
    expect(mockGit.clone).not.toHaveBeenCalled();
  });

  it("returns localPath and headSha", async () => {
    (access as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ENOENT"));

    const result = await cloneOrUpdate(
      { github: "org/repo", name: "repo" },
      "/cache"
    );

    expect(result.localPath).toContain("/cache/");
    expect(result.headSha).toBe("abc123");
  });

  it("rejects unsafe ref with special characters", async () => {
    (access as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ENOENT"));

    await expect(
      cloneOrUpdate(
        { github: "org/repo", name: "repo", ref: "; rm -rf /" },
        "/cache"
      )
    ).rejects.toThrow("Unsafe Git ref");
  });
});
