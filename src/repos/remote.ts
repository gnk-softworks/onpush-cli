import { simpleGit } from "simple-git";
import { join } from "node:path";
import { access } from "node:fs/promises";
import { getHeadSha } from "../git/history.js";

const ALLOWED_URL_PATTERNS = [
  /^https:\/\//,
  /^http:\/\//,
  /^git@[a-zA-Z0-9._-]+:/,
  /^ssh:\/\//,
];

/**
 * Validates that a Git URL uses a safe, allowed protocol.
 * Rejects dangerous protocols like ext:: that allow arbitrary command execution.
 */
function validateGitUrl(url: string): void {
  const isAllowed = ALLOWED_URL_PATTERNS.some((pattern) => pattern.test(url));
  if (!isAllowed) {
    throw new Error(
      `Unsupported or unsafe Git URL: "${url}". ` +
        `Only https://, http://, ssh://, and git@ URLs are allowed.`
    );
  }
}

const SAFE_REF_PATTERN = /^[a-zA-Z0-9._\-/]+$/;

/**
 * Validates that a Git ref (branch/tag name) contains only safe characters.
 */
function validateGitRef(ref: string): void {
  if (!SAFE_REF_PATTERN.test(ref)) {
    throw new Error(
      `Unsafe Git ref: "${ref}". ` +
        `Refs must contain only alphanumeric characters, dots, hyphens, underscores, and slashes.`
    );
  }
}

/**
 * Resolves a repository spec to a Git URL.
 * Handles github shorthand (org/repo → https://github.com/org/repo.git),
 * and passes through regular Git URLs after validating the protocol.
 */
export function resolveGitUrl(spec: {
  url?: string;
  github?: string;
}): string {
  if (spec.url) {
    validateGitUrl(spec.url);
    return spec.url;
  }
  if (spec.github) {
    return `https://github.com/${spec.github}.git`;
  }
  throw new Error("Repository spec must have either url or github");
}

/**
 * Converts a URL to a safe directory name for caching.
 */
export function sanitizeDirName(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^git@/, "")
    .replace(/\.git$/, "")
    .replace(/[/:@]/g, "-")
    .replace(/--+/g, "-")
    .toLowerCase();
}

/**
 * Clones or updates a remote repository in the cache directory.
 * Returns the local path to the cached clone.
 */
export async function cloneOrUpdate(
  spec: { url?: string; github?: string; ref?: string; name: string },
  cacheDir: string
): Promise<{ localPath: string; headSha: string }> {
  const gitUrl = resolveGitUrl(spec);
  if (spec.ref) {
    validateGitRef(spec.ref);
  }
  const dirName = sanitizeDirName(gitUrl);
  const localPath = join(cacheDir, dirName);

  const exists = await access(localPath)
    .then(() => true)
    .catch(() => false);

  try {
    if (exists) {
      // Update existing clone
      const git = simpleGit(localPath);

      // Unshallow if needed so incremental diffs work against old SHAs
      const isShallow = await git.revparse(["--is-shallow-repository"]);
      if (isShallow.trim() === "true") {
        await git.fetch(["--unshallow"]);
      } else {
        await git.fetch();
      }

      if (spec.ref) {
        await git.checkout(spec.ref);
        await git.pull("origin", spec.ref);
      } else {
        // No ref specified — pull latest on current branch
        await git.pull();
      }
    } else {
      // Fresh clone
      const git = simpleGit();
      const cloneOptions: string[] = [];
      if (spec.ref) {
        cloneOptions.push("--branch", spec.ref);
      }
      await git.clone(gitUrl, localPath, cloneOptions);
    }
  } catch (err: unknown) {
    const message = (err as Error).message ?? String(err);
    if (message.includes("could not find remote") || message.includes("not found")) {
      throw new Error(
        `Failed to clone/update repository "${spec.name}": remote not found. ` +
          `Check the URL or GitHub shorthand: ${gitUrl}`,
        { cause: err }
      );
    }
    if (message.includes("Authentication failed") || message.includes("could not read Username")) {
      throw new Error(
        `Failed to clone/update repository "${spec.name}": authentication failed. ` +
          `Ensure GITHUB_TOKEN or GIT_CREDENTIALS is set for private repos.`,
        { cause: err }
      );
    }
    throw new Error(
      `Failed to clone/update repository "${spec.name}": ${message}`,
      { cause: err }
    );
  }

  const headSha = await getHeadSha(localPath);
  return { localPath, headSha };
}
