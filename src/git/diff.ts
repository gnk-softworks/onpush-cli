import { simpleGit } from "simple-git";

export interface DiffSummary {
  changed: number;
  insertions: number;
  deletions: number;
  files: Array<{
    file: string;
    changes: number;
    insertions: number;
    deletions: number;
    binary: boolean;
  }>;
}

/**
 * Get a file-level diff summary between two commits.
 */
export async function getDiffSummary(
  repoPath: string,
  fromSha: string,
  toSha: string
): Promise<DiffSummary> {
  const git = simpleGit(repoPath);
  const diff = await git.diffSummary([fromSha, toSha]);
  return {
    changed: diff.changed,
    insertions: diff.insertions,
    deletions: diff.deletions,
    files: diff.files.map((f) => ({
      file: f.file,
      changes: "changes" in f ? f.changes : 0,
      insertions: "insertions" in f ? f.insertions : 0,
      deletions: "deletions" in f ? f.deletions : 0,
      binary: f.binary,
    })),
  };
}

/**
 * Get the raw diff text between two commits (for the agent to analyze).
 */
export async function getDiffText(
  repoPath: string,
  fromSha: string,
  toSha: string
): Promise<string> {
  const git = simpleGit(repoPath);
  return git.diff([fromSha, toSha]);
}
