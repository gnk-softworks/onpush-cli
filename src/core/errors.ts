export enum ExitCode {
  Success = 0,
  Fatal = 1,
  PartialFailure = 2,
  CostLimitExceeded = 3,
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class GenerationError extends Error {
  public readonly slug?: string;

  constructor(message: string, slug?: string) {
    super(message);
    this.name = "GenerationError";
    this.slug = slug;
  }
}

export class CancelError extends Error {
  constructor() {
    super("Operation cancelled by user.");
    this.name = "CancelError";
  }
}

export class CostLimitError extends Error {
  public readonly currentCost: number;
  public readonly limit: number;

  constructor(currentCost: number, limit: number) {
    super(
      `Cost limit exceeded: $${currentCost.toFixed(4)} > $${limit.toFixed(4)}`
    );
    this.name = "CostLimitError";
    this.currentCost = currentCost;
    this.limit = limit;
  }
}
