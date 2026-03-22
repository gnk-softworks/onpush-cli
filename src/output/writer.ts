import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { generateFrontmatter, type FrontmatterOptions } from "./frontmatter.js";

/**
 * Ensures the output directory exists.
 */
export async function ensureOutputDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/**
 * Writes a generated document to disk with YAML frontmatter.
 * Returns the full path of the written file.
 */
export async function writeDocument(
  outputDir: string,
  slug: string,
  content: string,
  frontmatterOpts: FrontmatterOptions,
  filenameTemplate: string
): Promise<string> {
  const filename = filenameTemplate.replace("{slug}", slug);
  const filePath = resolve(outputDir, filename);
  const resolvedOutputDir = resolve(outputDir);

  if (!filePath.startsWith(resolvedOutputDir + "/") && filePath !== resolvedOutputDir) {
    throw new Error(
      `Path traversal detected: resolved path "${filePath}" escapes output directory "${resolvedOutputDir}"`
    );
  }

  await mkdir(dirname(filePath), { recursive: true });

  const frontmatter = generateFrontmatter(frontmatterOpts);
  const fullContent = `${frontmatter}\n\n${content}\n`;

  await writeFile(filePath, fullContent, "utf-8");
  return filePath;
}
