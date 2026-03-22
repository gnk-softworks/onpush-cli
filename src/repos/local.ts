import { resolve } from "node:path";
import { isGitRepo } from "../git/files.js";
import { getHeadSha } from "../git/history.js";
import type { ResolvedRepo } from "./manager.js";

/**
 * Resolves a local repository path, validates it's a git repo, and gets HEAD.
 */
export async function resolveLocalRepo(
  path: string,
  name: string,
  basePath: string
): Promise<ResolvedRepo> {
  const absolutePath = resolve(basePath, path);

  const isRepo = await isGitRepo(absolutePath);
  if (!isRepo) {
    throw new Error(`Not a git repository: ${absolutePath}`);
  }

  const headSha = await getHeadSha(absolutePath);

  return {
    name,
    localPath: absolutePath,
    type: "local",
    headSha,
  };
}
