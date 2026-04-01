export interface MermaidBlock {
  index: number;
  startLine: number;
  endLine: number;
  content: string;
}

export interface MermaidValidationError {
  blockIndex: number;
  startLine: number;
  message: string;
  diagramSnippet: string;
}

export interface MermaidValidationResult {
  valid: boolean;
  errors: MermaidValidationError[];
  structuralErrors: string[];
  blockCount: number;
}

export interface ExtractionResult {
  blocks: MermaidBlock[];
  structuralErrors: string[];
}

/**
 * Extracts mermaid code blocks from markdown content.
 * Also detects structural issues like unclosed fences and empty blocks.
 */
export function extractMermaidBlocks(markdown: string): ExtractionResult {
  const lines = markdown.split("\n");
  const blocks: MermaidBlock[] = [];
  const structuralErrors: string[] = [];

  let inCodeBlock = false;
  let inMermaidBlock = false;
  let blockStartLine = 0;
  let blockContent: string[] = [];
  let blockIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!inCodeBlock) {
      // Check for opening code fence
      if (/^```/.test(trimmed)) {
        inCodeBlock = true;
        const lang = trimmed.slice(3).trim().toLowerCase();
        if (lang === "mermaid") {
          inMermaidBlock = true;
          blockStartLine = i + 1; // 1-based
          blockContent = [];
        }
      }
    } else {
      // Inside a code block — check for closing fence
      if (/^```\s*$/.test(trimmed)) {
        if (inMermaidBlock) {
          const content = blockContent.join("\n").trim();
          if (content.length === 0) {
            structuralErrors.push(
              `Empty mermaid block at line ${blockStartLine}`
            );
          } else {
            blocks.push({
              index: blockIndex,
              startLine: blockStartLine,
              endLine: i + 1,
              content,
            });
          }
          blockIndex++;
          inMermaidBlock = false;
        }
        inCodeBlock = false;
      } else if (inMermaidBlock) {
        blockContent.push(line);
      }
    }
  }

  // Check for unclosed mermaid block
  if (inMermaidBlock) {
    structuralErrors.push(
      `Unclosed mermaid code fence starting at line ${blockStartLine}`
    );
  }

  return { blocks, structuralErrors };
}

// Lazy-loaded mermaid module
let mermaidApi: { parse: (text: string) => Promise<unknown> } | null = null;
let mermaidLoadAttempted = false;

/**
 * Sets up minimal DOM globals required by mermaid's DOMPurify dependency.
 * Must be called before importing mermaid.
 */
async function ensureDomGlobals(): Promise<void> {
  if (typeof globalThis.document !== "undefined") return;
  try {
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
    globalThis.window = dom.window as unknown as Window & typeof globalThis;
    globalThis.document = dom.window.document;
    globalThis.DOMParser = dom.window.DOMParser;
    globalThis.HTMLElement = dom.window.HTMLElement as unknown as typeof HTMLElement;
    Object.defineProperty(globalThis, "navigator", {
      value: dom.window.navigator,
      writable: true,
      configurable: true,
    });
    globalThis.SVGElement = dom.window.SVGElement as unknown as typeof SVGElement;
  } catch {
    // jsdom unavailable — mermaid import will fail gracefully below
  }
}

async function getMermaidParser(): Promise<typeof mermaidApi> {
  if (mermaidLoadAttempted) return mermaidApi;
  mermaidLoadAttempted = true;
  try {
    await ensureDomGlobals();
    const mod = await import("mermaid");
    const mermaid = mod.default;
    mermaid.initialize({
      startOnLoad: false,
      suppressErrorRendering: true,
    });
    mermaidApi = { parse: (text: string) => mermaid.parse(text) };
    return mermaidApi;
  } catch {
    return null;
  }
}

/**
 * Validates all mermaid diagrams in the given markdown.
 * Uses the mermaid package's parse() function for syntax validation.
 * Falls back gracefully if mermaid is unavailable.
 */
export async function validateMermaidDiagrams(
  markdown: string
): Promise<MermaidValidationResult> {
  const { blocks, structuralErrors } = extractMermaidBlocks(markdown);

  if (blocks.length === 0) {
    return {
      valid: structuralErrors.length === 0,
      errors: [],
      structuralErrors,
      blockCount: 0,
    };
  }

  const parser = await getMermaidParser();
  if (!parser) {
    // mermaid unavailable — only report structural errors
    return {
      valid: structuralErrors.length === 0,
      errors: [],
      structuralErrors,
      blockCount: blocks.length,
    };
  }

  const errors: MermaidValidationError[] = [];

  for (const block of blocks) {
    try {
      await parser.parse(block.content);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err);
      errors.push({
        blockIndex: block.index,
        startLine: block.startLine,
        message,
        diagramSnippet: block.content.slice(0, 200),
      });
    }
  }

  return {
    valid: errors.length === 0 && structuralErrors.length === 0,
    errors,
    structuralErrors,
    blockCount: blocks.length,
  };
}

/**
 * Formats validation errors into a string suitable for returning to the AI agent.
 */
export function formatValidationErrors(
  result: MermaidValidationResult
): string {
  const parts: string[] = [];

  for (const err of result.structuralErrors) {
    parts.push(`Structural error: ${err}`);
  }

  for (const err of result.errors) {
    parts.push(
      `Mermaid block ${err.blockIndex + 1} (line ${err.startLine}): ${err.message}\n` +
        `  Diagram starts with: ${err.diagramSnippet}`
    );
  }

  return parts.join("\n\n");
}

const MAX_VALIDATION_ATTEMPTS = 3;

export interface SaveValidationOptions {
  content: string;
  attemptCount: number;
}

export interface SaveValidationResult {
  accepted: boolean;
  errorMessage?: string;
}

/**
 * Validates document content for mermaid diagram errors before saving.
 * After MAX_VALIDATION_ATTEMPTS failed attempts, accepts the document anyway.
 */
export async function validateDocumentForSave(
  options: SaveValidationOptions
): Promise<SaveValidationResult> {
  const { content, attemptCount } = options;

  const result = await validateMermaidDiagrams(content);

  if (result.valid) {
    return { accepted: true };
  }

  // If we've exhausted retries, accept with warning
  if (attemptCount >= MAX_VALIDATION_ATTEMPTS) {
    return { accepted: true };
  }

  return {
    accepted: false,
    errorMessage: formatValidationErrors(result),
  };
}

/**
 * Resets the mermaid loader state. Used for testing.
 */
export function _resetMermaidLoader(): void {
  mermaidApi = null;
  mermaidLoadAttempted = false;
}
