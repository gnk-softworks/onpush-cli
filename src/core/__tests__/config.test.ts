import { vi } from "vitest";
import { resolveConfigPath, getConfigDir, loadConfig, saveConfig } from "../config.js";
import { ConfigError } from "../errors.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

const { readFile, writeFile } = await import("node:fs/promises");

describe("resolveConfigPath", () => {
  it("returns absolute path of flagPath when provided", () => {
    const result = resolveConfigPath("/custom/config.yml");
    expect(result).toBe("/custom/config.yml");
  });

  it("returns .onpush/config.yml relative to cwd when no flag", () => {
    const result = resolveConfigPath();
    expect(result).toContain(".onpush/config.yml");
  });

  it("resolves relative flagPath against cwd", () => {
    const result = resolveConfigPath("my-config.yml");
    expect(result).toMatch(/\/my-config\.yml$/);
    expect(result).toMatch(/^\//); // absolute
  });
});

describe("getConfigDir", () => {
  it("returns parent directory of config path", () => {
    expect(getConfigDir("/foo/.onpush/config.yml")).toBe("/foo/.onpush");
  });
});

describe("loadConfig", () => {
  it("throws ConfigError with 'not found' when file doesn't exist", async () => {
    const err: NodeJS.ErrnoException = new Error("ENOENT");
    err.code = "ENOENT";
    (readFile as ReturnType<typeof vi.fn>).mockRejectedValue(err);

    await expect(loadConfig("/test/config.yml")).rejects.toThrow(ConfigError);
    await expect(loadConfig("/test/config.yml")).rejects.toThrow("not found");
  });

  it("throws ConfigError for other read errors", async () => {
    (readFile as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Permission denied")
    );
    await expect(loadConfig("/test/config.yml")).rejects.toThrow(ConfigError);
    await expect(loadConfig("/test/config.yml")).rejects.toThrow(
      "Failed to read"
    );
  });

  it("throws ConfigError for invalid YAML", async () => {
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue("{{{{invalid yaml");
    await expect(loadConfig("/test/config.yml")).rejects.toThrow(ConfigError);
    await expect(loadConfig("/test/config.yml")).rejects.toThrow("Invalid YAML");
  });

  it("successfully loads valid current-mode config", async () => {
    const yaml = `
mode: current
project:
  name: Test Project
`;
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(yaml);
    const config = await loadConfig("/test/.onpush/config.yml");
    expect(config.mode).toBe("current");
    expect(config.project.name).toBe("Test Project");
  });

  it("successfully loads valid remote-mode config", async () => {
    const yaml = `
mode: remote
project:
  name: Multi Repo
repositories:
  - name: frontend
    github: org/frontend
  - name: backend
    url: https://github.com/org/backend.git
`;
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(yaml);
    const config = await loadConfig("/test/.onpush/config.yml");
    expect(config.mode).toBe("remote");
    expect(config.repositories).toHaveLength(2);
  });

  it("applies Zod defaults", async () => {
    const yaml = `
mode: current
project:
  name: Test
`;
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(yaml);
    const config = await loadConfig("/test/.onpush/config.yml");
    expect(config.version).toBe(1);
    expect(config.output.directory).toBe("docs/");
    expect(config.output.filename_template).toBe("{slug}.md");
    expect(config.output.toc).toBe(true);
    expect(config.generation.provider).toBe("anthropic");
    expect(config.generation.model).toBe("claude-sonnet-4-6");
    expect(config.generation.cost_limit).toBeNull();
    expect(config.generation.timeout).toBe(3600);
    expect(config.generation.parallel).toBe(10);
  });

  it("rejects config missing required project.name", async () => {
    const yaml = `
mode: current
project: {}
`;
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(yaml);
    await expect(loadConfig("/test/.onpush/config.yml")).rejects.toThrow(
      ConfigError
    );
  });

  it("rejects config with invalid mode", async () => {
    const yaml = `
mode: invalid
project:
  name: Test
`;
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(yaml);
    await expect(loadConfig("/test/.onpush/config.yml")).rejects.toThrow(
      ConfigError
    );
  });

  it("rejects remote mode with empty repositories", async () => {
    const yaml = `
mode: remote
project:
  name: Test
repositories: []
`;
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(yaml);
    await expect(loadConfig("/test/.onpush/config.yml")).rejects.toThrow(
      ConfigError
    );
  });

  it("rejects repository with multiple source fields", async () => {
    const yaml = `
mode: remote
project:
  name: Test
repositories:
  - name: repo
    path: /local
    url: https://example.com/repo.git
`;
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(yaml);
    await expect(loadConfig("/test/.onpush/config.yml")).rejects.toThrow(
      ConfigError
    );
  });

  it("rejects filename_template containing ..", async () => {
    const yaml = `
mode: current
project:
  name: Test
output:
  filename_template: "../{slug}.md"
`;
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(yaml);
    await expect(loadConfig("/test/.onpush/config.yml")).rejects.toThrow(
      ConfigError
    );
  });

  it("rejects filename_template starting with /", async () => {
    const yaml = `
mode: current
project:
  name: Test
output:
  filename_template: "/{slug}.md"
`;
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(yaml);
    await expect(loadConfig("/test/.onpush/config.yml")).rejects.toThrow(
      ConfigError
    );
  });

  it("rejects custom_type slug with uppercase", async () => {
    const yaml = `
mode: current
project:
  name: Test
custom_types:
  - slug: BadSlug
    name: Bad
    description: Bad type
    prompt: Generate bad
`;
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(yaml);
    await expect(loadConfig("/test/.onpush/config.yml")).rejects.toThrow(
      ConfigError
    );
  });

  it("accepts valid custom_type slug", async () => {
    const yaml = `
mode: current
project:
  name: Test
custom_types:
  - slug: my-doc-type
    name: My Doc
    description: Custom doc
    prompt: Generate it
`;
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(yaml);
    const config = await loadConfig("/test/.onpush/config.yml");
    expect(config.custom_types).toHaveLength(1);
    expect(config.custom_types[0].slug).toBe("my-doc-type");
  });

  it("validates generation.provider enum", async () => {
    const yaml = `
mode: current
project:
  name: Test
generation:
  provider: openai
`;
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(yaml);
    await expect(loadConfig("/test/.onpush/config.yml")).rejects.toThrow(
      ConfigError
    );
  });

  it("includes formatted Zod issues in error message", async () => {
    const yaml = `
mode: current
project: {}
`;
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(yaml);
    try {
      await loadConfig("/test/.onpush/config.yml");
      expect.fail("Should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("Invalid config:");
    }
  });
});

describe("saveConfig", () => {
  it("calls writeFile with YAML content", async () => {
    const config = {
      version: 1,
      mode: "current" as const,
      project: { name: "Test" },
      output: { directory: "docs/", filename_template: "{slug}.md", toc: true },
      generation: {
        provider: "anthropic" as const,
        model: "claude-sonnet-4-6",
        cost_limit: null,
        timeout: 3600,
        parallel: 10,
      },
      types: {},
      custom_types: [],
      exclude: [],
    };
    await saveConfig("/test/.onpush/config.yml", config);
    expect(writeFile).toHaveBeenCalled();
    const [path, content] = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toContain("config.yml");
    expect(content).toContain("mode: current");
    expect(content).toContain("name: Test");
  });
});
