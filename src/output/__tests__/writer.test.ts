import { vi } from "vitest";
import { ensureOutputDir, writeDocument } from "../writer.js";

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Must import after mock setup
const { writeFile, mkdir } = await import("node:fs/promises");

describe("ensureOutputDir", () => {
  it("calls mkdir with recursive: true", async () => {
    await ensureOutputDir("/tmp/docs");
    expect(mkdir).toHaveBeenCalledWith("/tmp/docs", { recursive: true });
  });
});

describe("writeDocument", () => {
  const defaultOpts = {
    title: "Architecture",
    version: 1,
    model: "claude-sonnet-4-6",
    generatedAt: "2025-01-01T00:00:00Z",
  };

  it("writes file with frontmatter prepended", async () => {
    await writeDocument("/tmp/docs", "arch", "# Content", defaultOpts, "{slug}.md");
    const writtenContent = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(writtenContent).toMatch(/^---\n/);
    expect(writtenContent).toContain("# Content");
  });

  it("uses filename_template with {slug} replaced", async () => {
    const path = await writeDocument(
      "/tmp/docs",
      "architecture",
      "# Arch",
      defaultOpts,
      "{slug}.md"
    );
    expect(path).toContain("architecture.md");
  });

  it("creates parent directory before writing", async () => {
    await writeDocument("/tmp/docs", "arch", "# Content", defaultOpts, "{slug}.md");
    expect(mkdir).toHaveBeenCalled();
  });

  it("returns full path of written file", async () => {
    const path = await writeDocument(
      "/tmp/docs",
      "arch",
      "# Content",
      defaultOpts,
      "{slug}.md"
    );
    expect(path).toMatch(/\/tmp\/docs\/arch\.md$/);
  });

  it("content ends with newline", async () => {
    await writeDocument("/tmp/docs", "arch", "# Content", defaultOpts, "{slug}.md");
    const writtenContent = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(writtenContent).toMatch(/\n$/);
  });

  it("throws on path traversal with ../evil slug", async () => {
    await expect(
      writeDocument("/tmp/docs", "../evil", "# Bad", defaultOpts, "{slug}.md")
    ).rejects.toThrow("Path traversal detected");
  });

  it("throws on path traversal with absolute template", async () => {
    await expect(
      writeDocument("/tmp/docs", "arch", "# Bad", defaultOpts, "/etc/{slug}.md")
    ).rejects.toThrow("Path traversal detected");
  });

  it("handles nested filename_template", async () => {
    const path = await writeDocument(
      "/tmp/docs",
      "arch",
      "# Content",
      defaultOpts,
      "sub/{slug}.md"
    );
    expect(path).toContain("sub/arch.md");
  });
});
