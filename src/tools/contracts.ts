import type { z } from "zod";

export interface ToolContext {
  sessionId: string;
  step: number;
}

export interface ToolRetryPolicy {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface ToolDefinition<TArgs = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TArgs>;
  idempotent: boolean;
  retryPolicy?: ToolRetryPolicy | undefined;
  isRetryableError?: ((error: unknown) => boolean) | undefined;
  execute(args: TArgs, context: ToolContext): Promise<string>;
}
