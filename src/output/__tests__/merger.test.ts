import { mergeDocuments, type MergeableDocument } from "../merger.js";

describe("mergeDocuments", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sorts documents by canonical DOCUMENT_TYPE_ORDER", () => {
    const docs: MergeableDocument[] = [
      { slug: "security", name: "Security", content: "# Security" },
      { slug: "product-overview", name: "Product Overview", content: "# Overview" },
      { slug: "architecture", name: "Architecture", content: "# Architecture" },
    ];
    const result = mergeDocuments(docs, "claude-sonnet-4-6");
    const overviewIdx = result.indexOf("# Overview");
    const archIdx = result.indexOf("# Architecture");
    const secIdx = result.indexOf("# Security");
    expect(overviewIdx).toBeLessThan(archIdx);
    expect(archIdx).toBeLessThan(secIdx);
  });

  it("sorts custom types alphabetically after built-ins", () => {
    const docs: MergeableDocument[] = [
      { slug: "zebra-guide", name: "Zebra Guide", content: "# Zebra" },
      { slug: "product-overview", name: "Product Overview", content: "# Overview" },
      { slug: "alpha-guide", name: "Alpha Guide", content: "# Alpha" },
    ];
    const result = mergeDocuments(docs, "claude-sonnet-4-6");
    const overviewIdx = result.indexOf("# Overview");
    const alphaIdx = result.indexOf("# Alpha");
    const zebraIdx = result.indexOf("# Zebra");
    expect(overviewIdx).toBeLessThan(alphaIdx);
    expect(alphaIdx).toBeLessThan(zebraIdx);
  });

  it("generates frontmatter with Complete Documentation title", () => {
    const docs: MergeableDocument[] = [
      { slug: "architecture", name: "Architecture", content: "# Arch" },
    ];
    const result = mergeDocuments(docs, "claude-sonnet-4-6");
    expect(result).toContain("title: Complete Documentation");
  });

  it("includes table of contents with links", () => {
    const docs: MergeableDocument[] = [
      { slug: "architecture", name: "Architecture", content: "# Arch" },
      { slug: "security", name: "Security", content: "# Security" },
    ];
    const result = mergeDocuments(docs, "claude-sonnet-4-6");
    expect(result).toContain("- [Architecture](#architecture)");
    expect(result).toContain("- [Security](#security)");
  });

  it("separates documents with --- horizontal rules", () => {
    const docs: MergeableDocument[] = [
      { slug: "architecture", name: "Architecture", content: "# Arch" },
      { slug: "security", name: "Security", content: "# Security" },
    ];
    const result = mergeDocuments(docs, "claude-sonnet-4-6");
    expect(result).toContain("# Arch\n\n---\n\n<a id=\"security\"></a>\n\n# Security");
  });

  it("handles empty documents array", () => {
    const result = mergeDocuments([], "claude-sonnet-4-6");
    expect(result).toContain("title: Complete Documentation");
    expect(result).toContain("## Table of Contents");
  });

  it("handles single document correctly", () => {
    const docs: MergeableDocument[] = [
      { slug: "architecture", name: "Architecture", content: "# Arch content" },
    ];
    const result = mergeDocuments(docs, "claude-sonnet-4-6");
    expect(result).toContain("# Arch content");
    expect(result).toContain("- [Architecture](#architecture)");
  });

  it("preserves document content", () => {
    const docs: MergeableDocument[] = [
      {
        slug: "architecture",
        name: "Architecture",
        content: "# Architecture\n\nDetailed content here with **bold** and `code`.",
      },
    ];
    const result = mergeDocuments(docs, "claude-sonnet-4-6");
    expect(result).toContain(
      "# Architecture\n\nDetailed content here with **bold** and `code`."
    );
  });

  it("includes model in frontmatter", () => {
    const result = mergeDocuments([], "gpt-4.1");
    expect(result).toContain("model: gpt-4.1");
  });
});
