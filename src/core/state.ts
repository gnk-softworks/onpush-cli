import { z } from "zod";
import { readFile, writeFile, rename, mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const DocumentStateSchema = z.object({
  version: z.number(),
  lastGeneratedAt: z.string(),
  costUsd: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
});

const RepositoryStateSchema = z.object({
  lastCommitSha: z.string(),
  lastAnalyzedAt: z.string(),
});

const HistoryEntrySchema = z.object({
  timestamp: z.string(),
  type: z.enum(["full", "incremental"]),
  documentsUpdated: z.array(z.string()),
  totalCostUsd: z.number(),
  totalInputTokens: z.number().optional(),
  totalOutputTokens: z.number().optional(),
  durationMs: z.number(),
});

const StateSchema = z.object({
  version: z.number().default(1),
  mode: z.enum(["current", "remote"]),
  lastGeneration: z
    .object({
      timestamp: z.string(),
      type: z.enum(["full", "incremental"]),
      model: z.string(),
      totalCostUsd: z.number(),
      totalInputTokens: z.number(),
      totalOutputTokens: z.number(),
      durationMs: z.number(),
    })
    .nullable()
    .default(null),
  repositories: z.record(z.string(), RepositoryStateSchema).default({}),
  documents: z.record(z.string(), DocumentStateSchema).default({}),
  history: z.array(HistoryEntrySchema).default([]),
});

export type OnPushState = z.infer<typeof StateSchema>;
export type DocumentState = z.infer<typeof DocumentStateSchema>;
export type RepositoryState = z.infer<typeof RepositoryStateSchema>;
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

/**
 * Loads state from .onpush/state.json. Returns null if file doesn't exist.
 */
export async function loadState(
  configDir: string
): Promise<OnPushState | null> {
  const statePath = join(configDir, "state.json");

  let raw: string;
  try {
    raw = await readFile(statePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Failed to parse .onpush/state.json: file contains invalid JSON. ` +
        `Delete ${statePath} and re-run generation to rebuild it.`
    );
  }

  try {
    return StateSchema.parse(parsed);
  } catch {
    throw new Error(
      `Failed to validate .onpush/state.json: file structure is invalid. ` +
        `Delete ${statePath} and re-run generation to rebuild it.`
    );
  }
}

const LOCK_TIMEOUT_MS = 10_000;
const LOCK_RETRY_MS = 50;
const LOCK_STALE_MS = 30_000;

/**
 * Acquires an advisory lock using mkdir (atomic on all platforms).
 * Returns an unlock function.
 */
async function acquireLock(lockDir: string): Promise<() => Promise<void>> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (true) {
    try {
      await mkdir(lockDir);
      return async () => {
        try {
          await rm(lockDir, { recursive: true, force: true });
        } catch {
          // Best effort cleanup
        }
      };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      // Check for stale lock
      try {
        const lockStat = await stat(lockDir);
        if (Date.now() - lockStat.mtimeMs > LOCK_STALE_MS) {
          await rm(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Lock was removed between check — retry will succeed
        continue;
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `Failed to acquire state lock after ${LOCK_TIMEOUT_MS}ms. ` +
            `If no other onpush process is running, remove ${lockDir} manually.`,
          { cause: err }
        );
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }
}

/**
 * Saves state atomically (write to temp, then rename) with file-level locking.
 */
export async function saveState(
  configDir: string,
  state: OnPushState
): Promise<void> {
  await mkdir(configDir, { recursive: true });
  const statePath = join(configDir, "state.json");
  const lockDir = `${statePath}.lock`;
  const unlock = await acquireLock(lockDir);
  try {
    const tempPath = `${statePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(state, null, 2) + "\n", "utf-8");
    await rename(tempPath, statePath);
  } finally {
    await unlock();
  }
}

/**
 * Creates a fresh state object for a given mode.
 */
export function createInitialState(mode: "current" | "remote"): OnPushState {
  return {
    version: 1,
    mode,
    lastGeneration: null,
    repositories: {},
    documents: {},
    history: [],
  };
}

/**
 * Updates the document state for a specific slug.
 */
export function updateDocumentState(
  state: OnPushState,
  slug: string,
  result: {
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  }
): void {
  const existing = state.documents[slug];
  const version = existing ? existing.version + 1 : 1;
  state.documents[slug] = {
    version,
    lastGeneratedAt: new Date().toISOString(),
    costUsd: result.costUsd,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

const MAX_HISTORY_ENTRIES = 100;

/**
 * Appends a history entry to state, keeping at most MAX_HISTORY_ENTRIES.
 */
export function appendHistory(
  state: OnPushState,
  entry: HistoryEntry
): void {
  state.history.unshift(entry);
  if (state.history.length > MAX_HISTORY_ENTRIES) {
    state.history.length = MAX_HISTORY_ENTRIES;
  }
}
