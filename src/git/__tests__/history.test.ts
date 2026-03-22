import { vi } from "vitest";
import { getHeadSha, getCommitCount } from "../history.js";

const mockGit = {
  revparse: vi.fn(),
  log: vi.fn(),
};

vi.mock("simple-git", () => ({
  simpleGit: vi.fn(() => mockGit),
}));

describe("getHeadSha", () => {
  it("returns trimmed SHA", async () => {
    mockGit.revparse.mockResolvedValue("abc123def456  \n");
    const sha = await getHeadSha("/repo");
    expect(sha).toBe("abc123def456");
  });

  it("passes HEAD to revparse", async () => {
    mockGit.revparse.mockResolvedValue("abc123");
    await getHeadSha("/repo");
    expect(mockGit.revparse).toHaveBeenCalledWith(["HEAD"]);
  });
});

describe("getCommitCount", () => {
  it("returns log.total", async () => {
    mockGit.log.mockResolvedValue({ total: 5, all: [], latest: null });
    const count = await getCommitCount("/repo", "aaa", "bbb");
    expect(count).toBe(5);
  });

  it("passes from and to SHAs to git.log", async () => {
    mockGit.log.mockResolvedValue({ total: 0, all: [], latest: null });
    await getCommitCount("/repo", "sha1", "sha2");
    expect(mockGit.log).toHaveBeenCalledWith({ from: "sha1", to: "sha2" });
  });
});
