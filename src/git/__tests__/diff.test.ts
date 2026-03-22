import { vi } from "vitest";
import { getDiffSummary, getDiffText } from "../diff.js";

const mockGit = {
  diffSummary: vi.fn(),
  diff: vi.fn(),
};

vi.mock("simple-git", () => ({
  simpleGit: vi.fn(() => mockGit),
}));

describe("getDiffSummary", () => {
  it("maps fields correctly from git output", async () => {
    mockGit.diffSummary.mockResolvedValue({
      changed: 3,
      insertions: 50,
      deletions: 20,
      files: [
        { file: "src/index.ts", changes: 10, insertions: 8, deletions: 2, binary: false },
        { file: "logo.png", changes: 0, insertions: 0, deletions: 0, binary: true },
      ],
    });

    const result = await getDiffSummary("/repo", "aaa", "bbb");
    expect(result.changed).toBe(3);
    expect(result.insertions).toBe(50);
    expect(result.deletions).toBe(20);
    expect(result.files).toHaveLength(2);
    expect(result.files[0]).toEqual({
      file: "src/index.ts",
      changes: 10,
      insertions: 8,
      deletions: 2,
      binary: false,
    });
    expect(result.files[1].binary).toBe(true);
  });

  it("handles missing changes/insertions/deletions fields", async () => {
    mockGit.diffSummary.mockResolvedValue({
      changed: 1,
      insertions: 0,
      deletions: 0,
      files: [{ file: "test.txt", binary: false }],
    });

    const result = await getDiffSummary("/repo", "aaa", "bbb");
    expect(result.files[0].changes).toBe(0);
    expect(result.files[0].insertions).toBe(0);
    expect(result.files[0].deletions).toBe(0);
  });

  it("passes correct SHAs to diffSummary", async () => {
    mockGit.diffSummary.mockResolvedValue({
      changed: 0,
      insertions: 0,
      deletions: 0,
      files: [],
    });
    await getDiffSummary("/repo", "sha1", "sha2");
    expect(mockGit.diffSummary).toHaveBeenCalledWith(["sha1", "sha2"]);
  });
});

describe("getDiffText", () => {
  it("returns raw diff string", async () => {
    mockGit.diff.mockResolvedValue("diff --git a/file.ts b/file.ts\n+added line");
    const result = await getDiffText("/repo", "aaa", "bbb");
    expect(result).toBe("diff --git a/file.ts b/file.ts\n+added line");
  });

  it("passes correct SHAs to diff", async () => {
    mockGit.diff.mockResolvedValue("");
    await getDiffText("/repo", "sha1", "sha2");
    expect(mockGit.diff).toHaveBeenCalledWith(["sha1", "sha2"]);
  });
});
