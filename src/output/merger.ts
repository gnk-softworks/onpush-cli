import { generateFrontmatter } from "./frontmatter.js";
import { DOCUMENT_TYPE_ORDER } from "../core/document-types.js";

export interface MergeableDocument {
  slug: string;
  name: string;
  content: string;
}

/**
 * Merges multiple documents into a single Markdown file.
 * Documents are ordered by the canonical DOCUMENT_TYPE_ORDER,
 * with custom types appended alphabetically.
 */
export function mergeDocuments(
  documents: MergeableDocument[],
  model: string
): string {
  // Sort documents by canonical order, custom types alphabetically after
  const sorted = [...documents].sort((a, b) => {
    const aIndex = DOCUMENT_TYPE_ORDER.indexOf(a.slug);
    const bIndex = DOCUMENT_TYPE_ORDER.indexOf(b.slug);

    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  const sections = sorted
    .map((doc) => `<a id="${doc.slug}"></a>\n\n${doc.content}`)
    .join("\n\n---\n\n");

  const frontmatter = generateFrontmatter({
    title: "Complete Documentation",
    version: 1,
    model,
  });

  const toc = sorted
    .map(
      (doc) =>
        `- [${doc.name}](#${doc.slug})`
    )
    .join("\n");

  return `${frontmatter}\n\n# Complete Documentation\n\n## Table of Contents\n\n${toc}\n\n---\n\n${sections}\n`;
}
