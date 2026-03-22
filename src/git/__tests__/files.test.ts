import { vi } from "vitest";
import { isGitRepo, listTrackedFiles } from "../files.js";

const mockGit = {
  checkIsRepo: vi.fn(),
  raw: vi.fn(),
};

vi.mock("simple-git", () => ({
  simpleGit: vi.fn(() => mockGit),
}));

describe("isGitRepo", () => {
  it("returns true for valid git repo", async () => {
    mockGit.checkIsRepo.mockResolvedValue(true);
    expect(await isGitRepo("/my/repo")).toBe(true);
  });

  it("returns false for non-git directory", async () => {
    mockGit.checkIsRepo.mockResolvedValue(false);
    expect(await isGitRepo("/not/a/repo")).toBe(false);
  });
});

describe("listTrackedFiles", () => {
  it("returns all files when no exclude patterns", async () => {
    mockGit.raw.mockResolvedValue("src/index.ts\nsrc/utils.ts\n");
    const files = await listTrackedFiles("/repo", []);
    expect(files).toEqual(["src/index.ts", "src/utils.ts"]);
  });

  it("filters files matching exclude patterns", async () => {
    mockGit.raw.mockResolvedValue(
      "src/index.ts\nnode_modules/foo/bar.js\npackage-lock.json\n"
    );
    const files = await listTrackedFiles("/repo", [
      "node_modules/**",
      "**/*.lock",
      "**/package-lock.json",
    ]);
    expect(files).toEqual(["src/index.ts"]);
  });

  it("handles empty file list", async () => {
    mockGit.raw.mockResolvedValue("");
    const files = await listTrackedFiles("/repo", []);
    expect(files).toEqual([]);
  });

  it("trims whitespace from file names", async () => {
    mockGit.raw.mockResolvedValue("  src/index.ts  \n  src/utils.ts  \n");
    const files = await listTrackedFiles("/repo", []);
    expect(files).toEqual(["src/index.ts", "src/utils.ts"]);
  });

  it("filters empty lines from git output", async () => {
    mockGit.raw.mockResolvedValue("src/index.ts\n\n\nsrc/utils.ts\n\n");
    const files = await listTrackedFiles("/repo", []);
    expect(files).toEqual(["src/index.ts", "src/utils.ts"]);
  });

  it("applies multiple exclude patterns", async () => {
    mockGit.raw.mockResolvedValue(
      "src/index.ts\ndist/main.js\nbuild/out.js\n.env\n"
    );
    const files = await listTrackedFiles("/repo", [
      "dist/**",
      "build/**",
      ".env*",
    ]);
    expect(files).toEqual(["src/index.ts"]);
  });
});
