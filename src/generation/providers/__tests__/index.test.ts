import { vi } from "vitest";
import { createProvider } from "../index.js";

// Mock both provider modules
vi.mock("../anthropic.js", () => ({
  AnthropicProvider: class {
    name = "anthropic";
    runDocAgent = vi.fn();
  },
}));

vi.mock("../copilot.js", () => ({
  CopilotProvider: class {
    name = "copilot";
    runDocAgent = vi.fn();
  },
}));

vi.mock("../opencode.js", () => ({
  OpencodeProvider: class {
    name = "opencode";
    runDocAgent = vi.fn();
  },
}));

describe("createProvider", () => {
  it('returns provider for "anthropic"', async () => {
    const provider = await createProvider("anthropic");
    expect(provider.name).toBe("anthropic");
  });

  it('returns provider for "copilot"', async () => {
    const provider = await createProvider("copilot");
    expect(provider.name).toBe("copilot");
  });

  it('returns provider for "opencode"', async () => {
    const provider = await createProvider("opencode");
    expect(provider.name).toBe("opencode");
  });

  it("throws for unknown provider name", async () => {
    await expect(
      createProvider("openai" as "anthropic")
    ).rejects.toThrow("Unknown provider");
  });
});
