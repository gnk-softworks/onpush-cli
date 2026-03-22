import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { resolveLocalRepo } from "./local.js";
import { cloneOrUpdate } from "./remote.js";
import { getHeadSha } from "../git/history.js";
import { isGitRepo } from "../git/files.js";
import type { OnPushConfig } from "../core/document-types.js";
import type { OnPushState } from "../core/state.js";

export interface ResolvedRepo {
  name: string;
  localPath: string;
  type: "local" | "cloned";
  headSha: string;
}

export interface RepoChangeSet {
  repo: ResolvedRepo;
  hasChanges: boolean;
  fromSha?: string;
  toSha: string;
}

/**
 * Resolves all repositories from the config.
 * For single mode: uses cwd or the configured repository path.
 * For multi mode: resolves all entries in the repositories array.
 */
export async function resolveRepos(
  config: OnPushConfig,
  configPath: string
): Promise<ResolvedRepo[]> {
  const basePath = dirname(configPath);

  if (config.mode === "current") {
    if (config.repository?.path) {
      return [
        await resolveLocalRepo(config.repository.path, config.project.name, basePath),
      ];
    }

    // Default: use the directory containing the config
    const repoPath = resolve(basePath, "..");
    const isRepo = await isGitRepo(repoPath);
    if (!isRepo) {
      throw new Error(
        `Current directory is not a git repository: ${repoPath}`
      );
    }
    const headSha = await getHeadSha(repoPath);
    return [
      {
        name: config.project.name,
        localPath: repoPath,
        type: "local",
        headSha,
      },
    ];
  }

  // Multi mode
  if (!config.repositories || config.repositories.length === 0) {
    throw new Error("Remote repo(s) mode requires at least one repository");
  }

  const repos: ResolvedRepo[] = [];
  for (const repoSpec of config.repositories) {
    if (repoSpec.path) {
      repos.push(
        await resolveLocalRepo(repoSpec.path, repoSpec.name, basePath)
      );
    } else {
      // Remote repo — will be handled by syncRepos
      repos.push({
        name: repoSpec.name,
        localPath: "", // Will be set after sync
        type: "cloned",
        headSha: "", // Will be set after sync
      });
    }
  }

  return repos;
}

/**
 * Syncs remote repositories — clones or updates cached clones.
 * Returns a new array with updated localPath and headSha for remote repos.
 */
export async function syncRepos(
  config: OnPushConfig,
  repos: ResolvedRepo[],
  configPath: string
): Promise<ResolvedRepo[]> {
  if (config.mode === "current") return repos;
  if (!config.repositories) return repos;

  const cacheDir = resolve(dirname(configPath), "cache");
  await mkdir(cacheDir, { recursive: true });

  const updated = [...repos];
  for (let i = 0; i < config.repositories.length; i++) {
    const repoSpec = config.repositories[i];
    if (repoSpec.url || repoSpec.github) {
      const result = await cloneOrUpdate(repoSpec, cacheDir);
      updated[i] = { ...updated[i], localPath: result.localPath, headSha: result.headSha };
    }
  }
  return updated;
}

/**
 * Compares current HEAD SHAs against state to determine which repos have changes.
 */
export function getRepoChanges(
  repos: ResolvedRepo[],
  state: OnPushState | null
): RepoChangeSet[] {
  return repos.map((repo) => {
    const repoState = state?.repositories[slugify(repo.name)];
    if (!repoState) {
      return { repo, hasChanges: true, toSha: repo.headSha };
    }

    const hasChanges = repoState.lastCommitSha !== repo.headSha;
    return {
      repo,
      hasChanges,
      fromSha: repoState.lastCommitSha,
      toSha: repo.headSha,
    };
  });
}

/**
 * Converts a repo name to a URL-safe slug for state keys.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
