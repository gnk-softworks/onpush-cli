import { simpleGit } from "simple-git";

/**
 * Get the HEAD commit SHA for a repository.
 */
export async function getHeadSha(repoPath: string): Promise<string> {
  const git = simpleGit(repoPath);
  const sha = await git.revparse(["HEAD"]);
  return sha.trim();
}

/**
 * Get the number of commits between two SHAs.
 */
export async function getCommitCount(
  repoPath: string,
  fromSha: string,
  toSha: string
): Promise<number> {
  const git = simpleGit(repoPath);
  const log = await git.log({ from: fromSha, to: toSha });
  return log.total;
}
