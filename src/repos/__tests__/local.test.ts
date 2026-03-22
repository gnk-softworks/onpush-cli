import { vi } from "vitest";
import { resolveLocalRepo } from "../local.js";

vi.mock("../../git/files.js", () => ({
  isGitRepo: vi.fn(),
}));

vi.mock("../../git/history.js", () => ({
  getHeadSha: vi.fn(),
}));

const { isGitRepo } = await import("../../git/files.js");
const { getHeadSha } = await import("../../git/history.js");

describe("resolveLocalRepo", () => {
  beforeEach(() => {
    (getHeadSha as ReturnType<typeof vi.fn>).mockResolvedValue("abc123");
  });

  it("resolves relative path against basePath", async () => {
    (isGitRepo as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const result = await resolveLocalRepo("../myrepo", "Test Repo", "/base/dir");
    expect(result.localPath).toContain("myrepo");
  });

  it("returns correct ResolvedRepo structure", async () => {
    (isGitRepo as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const result = await resolveLocalRepo("/absolute/repo", "My Repo", "/base");
    expect(result.name).toBe("My Repo");
    expect(result.type).toBe("local");
    expect(result.headSha).toBe("abc123");
    expect(result.localPath).toContain("repo");
  });

  it("throws when not a git repository", async () => {
    (isGitRepo as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(
      resolveLocalRepo("/not/a/repo", "Test", "/base")
    ).rejects.toThrow("Not a git repository");
  });
});
