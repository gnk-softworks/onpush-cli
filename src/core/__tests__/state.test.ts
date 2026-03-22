import { vi } from "vitest";
import {
  loadState,
  saveState,
  createInitialState,
  updateDocumentState,
  appendHistory,
  type OnPushState,
  type HistoryEntry,
} from "../state.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ mtimeMs: Date.now() }),
}));

const { readFile, writeFile, rename, mkdir } = await import("node:fs/promises");

function makeValidState(): OnPushState {
  return {
    version: 1,
    mode: "current",
    lastGeneration: null,
    repositories: {},
    documents: {},
    history: [],
  };
}

describe("loadState", () => {
  it("returns null when file doesn't exist", async () => {
    const err: NodeJS.ErrnoException = new Error("ENOENT");
    err.code = "ENOENT";
    (readFile as ReturnType<typeof vi.fn>).mockRejectedValue(err);
    const result = await loadState("/test/.onpush");
    expect(result).toBeNull();
  });

  it("re-throws other read errors", async () => {
    (readFile as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Permission denied")
    );
    await expect(loadState("/test/.onpush")).rejects.toThrow("Permission denied");
  });

  it("throws for invalid JSON", async () => {
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue("not json{{{");
    await expect(loadState("/test/.onpush")).rejects.toThrow("invalid JSON");
  });

  it("throws for invalid state structure", async () => {
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify({ invalid: true })
    );
    await expect(loadState("/test/.onpush")).rejects.toThrow(
      "file structure is invalid"
    );
  });

  it("parses valid state JSON", async () => {
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify(makeValidState())
    );
    const state = await loadState("/test/.onpush");
    expect(state).not.toBeNull();
    expect(state!.mode).toBe("current");
    expect(state!.lastGeneration).toBeNull();
  });

  it("applies Zod defaults for missing optional fields", async () => {
    const minimal = { version: 1, mode: "current" };
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify(minimal)
    );
    const state = await loadState("/test/.onpush");
    expect(state!.lastGeneration).toBeNull();
    expect(state!.repositories).toEqual({});
    expect(state!.documents).toEqual({});
    expect(state!.history).toEqual([]);
  });
});

describe("saveState", () => {
  it("creates directory with recursive: true", async () => {
    await saveState("/test/.onpush", makeValidState());
    expect(mkdir).toHaveBeenCalledWith("/test/.onpush", { recursive: true });
  });

  it("writes to temp file", async () => {
    await saveState("/test/.onpush", makeValidState());
    const writePath = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(writePath).toContain("state.json.tmp");
  });

  it("renames temp to final", async () => {
    await saveState("/test/.onpush", makeValidState());
    const [from, to] = (rename as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(from).toContain("state.json.tmp");
    expect(to).toContain("state.json");
    expect(to).not.toContain(".tmp");
  });

  it("writes pretty-printed JSON with trailing newline", async () => {
    await saveState("/test/.onpush", makeValidState());
    const content = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(content).toMatch(/\n$/);
    // Pretty-printed = contains newlines within JSON
    expect(content.split("\n").length).toBeGreaterThan(2);
  });
});

describe("createInitialState", () => {
  it("returns correct structure for current mode", () => {
    const state = createInitialState("current");
    expect(state.mode).toBe("current");
    expect(state.version).toBe(1);
    expect(state.lastGeneration).toBeNull();
    expect(state.repositories).toEqual({});
    expect(state.documents).toEqual({});
    expect(state.history).toEqual([]);
  });

  it("returns correct structure for remote mode", () => {
    const state = createInitialState("remote");
    expect(state.mode).toBe("remote");
  });
});

describe("updateDocumentState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates new document state with version 1 for new slug", () => {
    const state = makeValidState();
    updateDocumentState(state, "architecture", {
      costUsd: 0.05,
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(state.documents.architecture.version).toBe(1);
  });

  it("increments version for existing slug", () => {
    const state = makeValidState();
    state.documents.architecture = {
      version: 2,
      lastGeneratedAt: "2025-01-01",
      costUsd: 0.01,
      inputTokens: 100,
      outputTokens: 50,
    };
    updateDocumentState(state, "architecture", {
      costUsd: 0.05,
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(state.documents.architecture.version).toBe(3);
  });

  it("sets lastGeneratedAt to current ISO string", () => {
    const state = makeValidState();
    updateDocumentState(state, "arch", {
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(state.documents.arch.lastGeneratedAt).toBe(
      "2025-06-15T12:00:00.000Z"
    );
  });

  it("stores cost and token data", () => {
    const state = makeValidState();
    updateDocumentState(state, "arch", {
      costUsd: 0.123,
      inputTokens: 5000,
      outputTokens: 2000,
    });
    expect(state.documents.arch.costUsd).toBe(0.123);
    expect(state.documents.arch.inputTokens).toBe(5000);
    expect(state.documents.arch.outputTokens).toBe(2000);
  });
});

describe("appendHistory", () => {
  it("prepends entry to history array", () => {
    const state = makeValidState();
    const entry: HistoryEntry = {
      timestamp: "2025-06-15T12:00:00Z",
      type: "full",
      documentsUpdated: ["architecture"],
      totalCostUsd: 0.05,
      durationMs: 5000,
    };
    appendHistory(state, entry);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toBe(entry);
  });

  it("maintains reverse chronological order", () => {
    const state = makeValidState();
    const first: HistoryEntry = {
      timestamp: "2025-06-14T12:00:00Z",
      type: "full",
      documentsUpdated: ["arch"],
      totalCostUsd: 0.01,
      durationMs: 1000,
    };
    const second: HistoryEntry = {
      timestamp: "2025-06-15T12:00:00Z",
      type: "incremental",
      documentsUpdated: ["security"],
      totalCostUsd: 0.02,
      durationMs: 2000,
    };
    appendHistory(state, first);
    appendHistory(state, second);
    expect(state.history[0]).toBe(second);
    expect(state.history[1]).toBe(first);
  });
});
