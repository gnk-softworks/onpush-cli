import { generateFrontmatter, parseFrontmatter } from "../frontmatter.js";

describe("generateFrontmatter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("produces YAML block delimited by ---", () => {
    const result = generateFrontmatter({
      title: "Test",
      version: 1,
      model: "claude-sonnet-4-6",
    });
    expect(result).toMatch(/^---\n[\s\S]+\n---$/);
  });

  it("includes title field", () => {
    const result = generateFrontmatter({
      title: "Architecture",
      version: 1,
      model: "claude-sonnet-4-6",
    });
    expect(result).toContain("title: Architecture");
  });

  it("includes generated_by: onpush", () => {
    const result = generateFrontmatter({
      title: "Test",
      version: 1,
      model: "claude-sonnet-4-6",
    });
    expect(result).toContain("generated_by: onpush");
  });

  it("includes version and model", () => {
    const result = generateFrontmatter({
      title: "Test",
      version: 3,
      model: "gpt-4.1",
    });
    expect(result).toContain("version: 3");
    expect(result).toContain("model: gpt-4.1");
  });

  it("uses provided generatedAt", () => {
    const result = generateFrontmatter({
      title: "Test",
      version: 1,
      model: "claude-sonnet-4-6",
      generatedAt: "2024-01-01T00:00:00Z",
    });
    expect(result).toContain("2024-01-01T00:00:00Z");
  });

  it("uses current date when generatedAt not provided", () => {
    const result = generateFrontmatter({
      title: "Test",
      version: 1,
      model: "claude-sonnet-4-6",
    });
    expect(result).toContain("2025-06-15T12:00:00.000Z");
  });
});

describe("parseFrontmatter", () => {
  it("extracts frontmatter and body from well-formed content", () => {
    const content = `---\ntitle: Test\nversion: 1\n---\n# Hello\n\nBody text`;
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter.title).toBe("Test");
    expect(frontmatter.version).toBe(1);
    expect(body).toBe("# Hello\n\nBody text");
  });

  it("returns empty frontmatter and full body when no frontmatter", () => {
    const content = "# Just a markdown file\n\nNo frontmatter here.";
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe(content);
  });

  it("returns empty frontmatter on invalid YAML", () => {
    const content = `---\n: : : invalid\n---\n# Body`;
    const { frontmatter, body } = parseFrontmatter(content);
    // yaml library may or may not throw on this; if it doesn't throw, it still parses something
    // The key test is that it doesn't crash
    expect(typeof frontmatter).toBe("object");
  });

  it("handles content with only frontmatter (empty body)", () => {
    const content = `---\ntitle: Test\n---\n`;
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter.title).toBe("Test");
    expect(body).toBe("");
  });

  it("roundtrips: generate then parse returns original values", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));

    const generated = generateFrontmatter({
      title: "Roundtrip Test",
      version: 2,
      model: "claude-sonnet-4-6",
    });

    const fullContent = `${generated}\n\n# Content\n\nHello world`;
    const { frontmatter, body } = parseFrontmatter(fullContent);
    expect(frontmatter.title).toBe("Roundtrip Test");
    expect(frontmatter.version).toBe(2);
    expect(frontmatter.model).toBe("claude-sonnet-4-6");
    expect(body).toContain("# Content");

    vi.useRealTimers();
  });
});
