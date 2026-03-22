import { simpleGit } from "simple-git";
import { minimatch } from "minimatch";

/**
 * Check if a path is a git repository.
 */
export async function isGitRepo(path: string): Promise<boolean> {
  const git = simpleGit(path);
  return git.checkIsRepo();
}

/**
 * List tracked files in a repo, filtering out files matching exclude patterns.
 */
export async function listTrackedFiles(
  repoPath: string,
  excludePatterns: string[]
): Promise<string[]> {
  const git = simpleGit(repoPath);
  const result = await git.raw(["ls-files"]);
  const files = result
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  if (excludePatterns.length === 0) {
    return files;
  }

  return files.filter(
    (file) => !excludePatterns.some((pattern) => minimatch(file, pattern))
  );
}
