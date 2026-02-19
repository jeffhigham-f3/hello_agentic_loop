export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const defaultOptions: RetryOptions = {
  attempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 2_000,
  shouldRetry: () => false,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const resolved = { ...defaultOptions, ...options };
  let attempt = 0;
  let lastError: unknown;

  while (attempt < resolved.attempts) {
    attempt += 1;
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryAllowed =
        attempt < resolved.attempts &&
        (resolved.shouldRetry?.(error, attempt) ?? true);
      if (!retryAllowed) {
        break;
      }

      const jitter = Math.floor(Math.random() * 50);
      const delay = Math.min(
        resolved.baseDelayMs * 2 ** (attempt - 1) + jitter,
        resolved.maxDelayMs,
      );
      await sleep(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Retry failed");
}
