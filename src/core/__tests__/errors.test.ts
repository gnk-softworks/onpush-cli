import {
  ExitCode,
  ConfigError,
  AuthError,
  GenerationError,
  CostLimitError,
} from "../errors.js";

describe("ExitCode", () => {
  it("has Success = 0", () => {
    expect(ExitCode.Success).toBe(0);
  });

  it("has Fatal = 1", () => {
    expect(ExitCode.Fatal).toBe(1);
  });

  it("has PartialFailure = 2", () => {
    expect(ExitCode.PartialFailure).toBe(2);
  });

  it("has CostLimitExceeded = 3", () => {
    expect(ExitCode.CostLimitExceeded).toBe(3);
  });
});

describe("ConfigError", () => {
  it("sets name to ConfigError", () => {
    const err = new ConfigError("bad config");
    expect(err.name).toBe("ConfigError");
  });

  it("preserves message", () => {
    const err = new ConfigError("missing field");
    expect(err.message).toBe("missing field");
  });

  it("is an instance of Error", () => {
    const err = new ConfigError("test");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("AuthError", () => {
  it("sets name to AuthError", () => {
    const err = new AuthError("no key");
    expect(err.name).toBe("AuthError");
  });

  it("preserves message", () => {
    const err = new AuthError("auth failed");
    expect(err.message).toBe("auth failed");
  });

  it("is an instance of Error", () => {
    const err = new AuthError("test");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("GenerationError", () => {
  it("sets name to GenerationError", () => {
    const err = new GenerationError("failed");
    expect(err.name).toBe("GenerationError");
  });

  it("preserves message", () => {
    const err = new GenerationError("generation failed");
    expect(err.message).toBe("generation failed");
  });

  it("stores slug when provided", () => {
    const err = new GenerationError("failed", "architecture");
    expect(err.slug).toBe("architecture");
  });

  it("slug is undefined when not provided", () => {
    const err = new GenerationError("failed");
    expect(err.slug).toBeUndefined();
  });

  it("is an instance of Error", () => {
    const err = new GenerationError("test");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("CostLimitError", () => {
  it("sets name to CostLimitError", () => {
    const err = new CostLimitError(1.5, 1.0);
    expect(err.name).toBe("CostLimitError");
  });

  it("stores currentCost and limit", () => {
    const err = new CostLimitError(2.5678, 2.0);
    expect(err.currentCost).toBe(2.5678);
    expect(err.limit).toBe(2.0);
  });

  it("formats message with 4 decimal places", () => {
    const err = new CostLimitError(1.5, 1.0);
    expect(err.message).toBe("Cost limit exceeded: $1.5000 > $1.0000");
  });

  it("formats small amounts correctly", () => {
    const err = new CostLimitError(0.0012, 0.001);
    expect(err.message).toBe("Cost limit exceeded: $0.0012 > $0.0010");
  });

  it("is an instance of Error", () => {
    const err = new CostLimitError(1, 0.5);
    expect(err).toBeInstanceOf(Error);
  });
});
