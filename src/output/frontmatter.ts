import { stringify as yamlStringify, parse as yamlParse } from "yaml";

export interface FrontmatterOptions {
  title: string;
  generatedAt?: string;
  version: number;
  model: string;
}

/**
 * Generates a YAML frontmatter block for a Markdown document.
 */
export function generateFrontmatter(options: FrontmatterOptions): string {
  const data: Record<string, unknown> = {
    title: options.title,
    generated_by: "onpush",
    generated_at: options.generatedAt ?? new Date().toISOString(),
    version: options.version,
    model: options.model,
  };
  return `---\n${yamlStringify(data).trim()}\n---`;
}

/**
 * Parses YAML frontmatter from a Markdown document.
 * Returns the frontmatter data and the body content separately.
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  try {
    const frontmatter = yamlParse(match[1]) as Record<string, unknown>;
    return { frontmatter, body: match[2].trim() };
  } catch {
    return { frontmatter: {}, body: content };
  }
}
