import {
  DEFAULT_DOCUMENT_TYPES,
  DOCUMENT_TYPE_ORDER,
  resolveEnabledTypes,
  getTypeBySlug,
  type OnPushConfig,
} from "../document-types.js";

function makeConfig(overrides: Partial<OnPushConfig> = {}): OnPushConfig {
  return {
    version: 1,
    mode: "current",
    project: { name: "Test" },
    output: { directory: "docs/", filename_template: "{slug}.md", toc: true },
    generation: {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      cost_limit: null,
      timeout: 3600,
      parallel: 10,
    },
    types: {},
    custom_types: [],
    exclude: [],
    ...overrides,
  };
}

describe("DEFAULT_DOCUMENT_TYPES", () => {
  it("contains exactly 9 entries", () => {
    expect(DEFAULT_DOCUMENT_TYPES).toHaveLength(9);
  });

  it("has first 6 types enabled by default", () => {
    const enabled = DEFAULT_DOCUMENT_TYPES.slice(0, 6);
    expect(enabled.every((t) => t.defaultEnabled)).toBe(true);
  });

  it("has last 3 types disabled by default", () => {
    const disabled = DEFAULT_DOCUMENT_TYPES.slice(6);
    expect(disabled.every((t) => !t.defaultEnabled)).toBe(true);
  });

  it("has unique slugs", () => {
    const slugs = DEFAULT_DOCUMENT_TYPES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("DOCUMENT_TYPE_ORDER", () => {
  it("has same length as DEFAULT_DOCUMENT_TYPES", () => {
    expect(DOCUMENT_TYPE_ORDER).toHaveLength(DEFAULT_DOCUMENT_TYPES.length);
  });

  it("matches slug order of DEFAULT_DOCUMENT_TYPES", () => {
    const expectedOrder = DEFAULT_DOCUMENT_TYPES.map((t) => t.slug);
    expect(DOCUMENT_TYPE_ORDER).toEqual(expectedOrder);
  });
});

describe("resolveEnabledTypes", () => {
  it("returns 6 default-enabled types when no overrides", () => {
    const types = resolveEnabledTypes(makeConfig());
    expect(types).toHaveLength(6);
    expect(types.every((t) => t.enabled)).toBe(true);
  });

  it("enables a default-disabled type via override", () => {
    const types = resolveEnabledTypes(
      makeConfig({ types: { deployment: { enabled: true } } })
    );
    expect(types.find((t) => t.slug === "deployment")).toBeDefined();
  });

  it("disables a default-enabled type via override", () => {
    const types = resolveEnabledTypes(
      makeConfig({ types: { security: { enabled: false } } })
    );
    expect(types.find((t) => t.slug === "security")).toBeUndefined();
  });

  it("uses custom name from override", () => {
    const types = resolveEnabledTypes(
      makeConfig({
        types: { architecture: { enabled: true, name: "System Design" } },
      })
    );
    const arch = types.find((t) => t.slug === "architecture");
    expect(arch?.name).toBe("System Design");
  });

  it("passes through custom prompt from override", () => {
    const types = resolveEnabledTypes(
      makeConfig({
        types: {
          architecture: { enabled: true, prompt: "Focus on microservices" },
        },
      })
    );
    const arch = types.find((t) => t.slug === "architecture");
    expect(arch?.prompt).toBe("Focus on microservices");
  });

  it("passes through custom model from override", () => {
    const types = resolveEnabledTypes(
      makeConfig({
        types: {
          architecture: { enabled: true, model: "claude-opus-4-6" },
        },
      })
    );
    const arch = types.find((t) => t.slug === "architecture");
    expect(arch?.model).toBe("claude-opus-4-6");
  });

  it("appends custom types after default types", () => {
    const types = resolveEnabledTypes(
      makeConfig({
        custom_types: [
          {
            slug: "runbook",
            name: "Runbook",
            description: "Ops runbook",
            prompt: "Write a runbook",
          },
        ],
      })
    );
    expect(types[types.length - 1].slug).toBe("runbook");
    expect(types[types.length - 1].enabled).toBe(true);
  });

  it("includes custom type description and prompt", () => {
    const types = resolveEnabledTypes(
      makeConfig({
        custom_types: [
          {
            slug: "runbook",
            name: "Runbook",
            description: "Ops runbook",
            prompt: "Write a runbook",
          },
        ],
      })
    );
    const runbook = types.find((t) => t.slug === "runbook");
    expect(runbook?.description).toBe("Ops runbook");
    expect(runbook?.prompt).toBe("Write a runbook");
  });

  it("enables all 9 types when all overridden to enabled", () => {
    const allEnabled: Record<string, { enabled: boolean }> = {};
    for (const t of DEFAULT_DOCUMENT_TYPES) {
      allEnabled[t.slug] = { enabled: true };
    }
    const types = resolveEnabledTypes(makeConfig({ types: allEnabled }));
    expect(types).toHaveLength(9);
  });
});

describe("getTypeBySlug", () => {
  const types = resolveEnabledTypes(makeConfig());

  it("returns matching type when slug exists", () => {
    const result = getTypeBySlug("architecture", types);
    expect(result).toBeDefined();
    expect(result!.slug).toBe("architecture");
  });

  it("returns undefined when slug not found", () => {
    const result = getTypeBySlug("nonexistent", types);
    expect(result).toBeUndefined();
  });
});
