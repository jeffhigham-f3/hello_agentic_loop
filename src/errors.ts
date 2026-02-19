export class AppError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  constructor(message: string, options: { code: string; retryable?: boolean }) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
  }
}

export class ProviderError extends AppError {
  constructor(message: string, retryable = false) {
    super(message, { code: "PROVIDER_ERROR", retryable });
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, { code: "VALIDATION_ERROR", retryable: false });
  }
}

export class ToolExecutionError extends AppError {
  constructor(message: string, retryable = false) {
    super(message, { code: "TOOL_EXECUTION_ERROR", retryable });
  }
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.retryable;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const transientPattern =
    /(timeout|timed out|temporar|rate limit|429|5\d\d|econnreset|enotfound|eai_again)/i;

  return transientPattern.test(error.message);
}
