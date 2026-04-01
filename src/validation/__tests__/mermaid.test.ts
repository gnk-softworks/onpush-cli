import {
  extractMermaidBlocks,
  validateMermaidDiagrams,
  formatValidationErrors,
  validateDocumentForSave,
  _resetMermaidLoader,
  type MermaidValidationResult,
} from "../mermaid.js";

afterEach(() => {
  _resetMermaidLoader();
});

describe("extractMermaidBlocks", () => {
  it("extracts a single mermaid block", () => {
    const md = `# Title

\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

Some text.`;

    const { blocks, structuralErrors } = extractMermaidBlocks(md);
    expect(structuralErrors).toHaveLength(0);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe("flowchart TD\n  A --> B");
    expect(blocks[0].startLine).toBe(3);
    expect(blocks[0].endLine).toBe(6);
    expect(blocks[0].index).toBe(0);
  });

  it("extracts multiple mermaid blocks", () => {
    const md = `\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

\`\`\`mermaid
sequenceDiagram
  Alice->>Bob: Hello
\`\`\``;

    const { blocks } = extractMermaidBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].content).toContain("flowchart");
    expect(blocks[1].content).toContain("sequenceDiagram");
    expect(blocks[0].index).toBe(0);
    expect(blocks[1].index).toBe(1);
  });

  it("returns empty array for no mermaid blocks", () => {
    const md = `# Title\n\nSome text.\n\n\`\`\`javascript\nconst x = 1;\n\`\`\``;
    const { blocks, structuralErrors } = extractMermaidBlocks(md);
    expect(blocks).toHaveLength(0);
    expect(structuralErrors).toHaveLength(0);
  });

  it("detects unclosed mermaid fence", () => {
    const md = `\`\`\`mermaid
flowchart TD
  A --> B`;

    const { blocks, structuralErrors } = extractMermaidBlocks(md);
    expect(blocks).toHaveLength(0);
    expect(structuralErrors).toHaveLength(1);
    expect(structuralErrors[0]).toContain("Unclosed");
    expect(structuralErrors[0]).toContain("line 1");
  });

  it("detects empty mermaid blocks", () => {
    const md = `\`\`\`mermaid
\`\`\``;

    const { blocks, structuralErrors } = extractMermaidBlocks(md);
    expect(blocks).toHaveLength(0);
    expect(structuralErrors).toHaveLength(1);
    expect(structuralErrors[0]).toContain("Empty");
  });

  it("ignores non-mermaid code blocks", () => {
    const md = `\`\`\`typescript
const x: number = 1;
\`\`\`

\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

\`\`\`python
print("hello")
\`\`\``;

    const { blocks } = extractMermaidBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toContain("flowchart");
  });

  it("handles case-insensitive mermaid tag", () => {
    const md = `\`\`\`Mermaid
flowchart TD
  A --> B
\`\`\``;

    const { blocks } = extractMermaidBlocks(md);
    expect(blocks).toHaveLength(1);
  });

  it("returns correct line numbers for blocks after other content", () => {
    const md = `Line 1
Line 2
Line 3
Line 4
\`\`\`mermaid
flowchart TD
  A --> B
\`\`\``;

    const { blocks } = extractMermaidBlocks(md);
    expect(blocks[0].startLine).toBe(5);
    expect(blocks[0].endLine).toBe(8);
  });
});

describe("validateMermaidDiagrams", () => {
  it("returns valid for markdown with no mermaid blocks", async () => {
    const result = await validateMermaidDiagrams("# Just a title\n\nSome text.");
    expect(result.valid).toBe(true);
    expect(result.blockCount).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("returns valid for correct flowchart syntax", async () => {
    const md = `\`\`\`mermaid
flowchart TD
  A[Start] --> B[End]
\`\`\``;

    const result = await validateMermaidDiagrams(md);
    expect(result.valid).toBe(true);
    expect(result.blockCount).toBe(1);
  });

  it("returns valid for correct sequence diagram syntax", async () => {
    const md = `\`\`\`mermaid
sequenceDiagram
  Alice->>Bob: Hello Bob
  Bob-->>Alice: Hi Alice
\`\`\``;

    const result = await validateMermaidDiagrams(md);
    expect(result.valid).toBe(true);
    expect(result.blockCount).toBe(1);
  });

  it("returns errors for invalid mermaid syntax", async () => {
    const md = `\`\`\`mermaid
flowchart INVALID
  A --> --> B
  [[[[
\`\`\``;

    const result = await validateMermaidDiagrams(md);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].blockIndex).toBe(0);
    expect(result.errors[0].startLine).toBe(1);
  });

  it("handles mixed valid and invalid blocks", async () => {
    const md = `\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

\`\`\`mermaid
this is not valid mermaid at all
\`\`\``;

    const result = await validateMermaidDiagrams(md);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].blockIndex).toBe(1);
  });

  it("reports structural errors alongside syntax errors", async () => {
    const md = `\`\`\`mermaid
flowchart TD
  A --> B`;

    const result = await validateMermaidDiagrams(md);
    expect(result.valid).toBe(false);
    expect(result.structuralErrors.length).toBeGreaterThan(0);
  });
});

describe("formatValidationErrors", () => {
  it("formats syntax errors with block index and line number", () => {
    const result: MermaidValidationResult = {
      valid: false,
      errors: [
        {
          blockIndex: 0,
          startLine: 5,
          message: "Parse error on line 2",
          diagramSnippet: "flowchart INVALID",
        },
      ],
      structuralErrors: [],
      blockCount: 1,
    };

    const formatted = formatValidationErrors(result);
    expect(formatted).toContain("Mermaid block 1");
    expect(formatted).toContain("line 5");
    expect(formatted).toContain("Parse error");
    expect(formatted).toContain("flowchart INVALID");
  });

  it("formats structural errors", () => {
    const result: MermaidValidationResult = {
      valid: false,
      errors: [],
      structuralErrors: ["Unclosed mermaid code fence starting at line 3"],
      blockCount: 0,
    };

    const formatted = formatValidationErrors(result);
    expect(formatted).toContain("Structural error");
    expect(formatted).toContain("Unclosed");
  });

  it("formats multiple errors", () => {
    const result: MermaidValidationResult = {
      valid: false,
      errors: [
        {
          blockIndex: 0,
          startLine: 3,
          message: "Error 1",
          diagramSnippet: "bad1",
        },
        {
          blockIndex: 1,
          startLine: 10,
          message: "Error 2",
          diagramSnippet: "bad2",
        },
      ],
      structuralErrors: ["Structural problem"],
      blockCount: 2,
    };

    const formatted = formatValidationErrors(result);
    expect(formatted).toContain("Mermaid block 1");
    expect(formatted).toContain("Mermaid block 2");
    expect(formatted).toContain("Structural error");
  });
});

describe("validateDocumentForSave", () => {
  it("accepts valid documents", async () => {
    const result = await validateDocumentForSave({
      content: `# Title\n\n\`\`\`mermaid\nflowchart TD\n  A --> B\n\`\`\``,
      attemptCount: 1,
    });
    expect(result.accepted).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  it("rejects invalid documents on first attempt", async () => {
    const result = await validateDocumentForSave({
      content: `\`\`\`mermaid\nthis is totally invalid\n\`\`\``,
      attemptCount: 1,
    });
    expect(result.accepted).toBe(false);
    expect(result.errorMessage).toBeDefined();
  });

  it("accepts invalid documents after max attempts", async () => {
    const result = await validateDocumentForSave({
      content: `\`\`\`mermaid\nthis is totally invalid\n\`\`\``,
      attemptCount: 3,
    });
    expect(result.accepted).toBe(true);
  });

  it("accepts documents with no mermaid blocks", async () => {
    const result = await validateDocumentForSave({
      content: "# Just text\n\nNo diagrams here.",
      attemptCount: 1,
    });
    expect(result.accepted).toBe(true);
  });
});
