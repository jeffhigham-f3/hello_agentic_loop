import type { ToolCallRequest, ToolCallResult } from "../types.js";
import { ValidationError, isRetryableError } from "../errors.js";
import { retryAsync } from "../utils/retry.js";
import type { ToolContext, ToolDefinition } from "./contracts.js";

export interface ToolRegistry {
  register<TArgs>(tool: ToolDefinition<TArgs>): void;
  execute(
    request: ToolCallRequest,
    context?: ToolContext,
  ): Promise<ToolCallResult>;
  list(): string[];
}

export class InMemoryToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<unknown>>();

  register<TArgs>(tool: ToolDefinition<TArgs>): void {
    if (this.tools.has(tool.name)) {
      throw new ValidationError(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool as ToolDefinition<unknown>);
  }

  list(): string[] {
    return [...this.tools.keys()];
  }

  async execute(
    request: ToolCallRequest,
    context: ToolContext = { sessionId: "unknown", step: 0 },
  ): Promise<ToolCallResult> {
    const tool = this.tools.get(request.toolName);
    if (!tool) {
      return {
        toolCallId: request.id,
        toolName: request.toolName,
        ok: false,
        content: "",
        error: `Tool not found: ${request.toolName}`,
        attempts: 1,
      };
    }

    const parsed = tool.inputSchema.safeParse(request.args);
    if (!parsed.success) {
      return {
        toolCallId: request.id,
        toolName: request.toolName,
        ok: false,
        content: "",
        error: parsed.error.message,
        attempts: 1,
      };
    }

    let attempts = 0;
    try {
      const retryPolicy = tool.idempotent
        ? (tool.retryPolicy ?? {
            attempts: 1,
            baseDelayMs: 0,
            maxDelayMs: 0,
          })
        : {
            attempts: 1,
            baseDelayMs: 0,
            maxDelayMs: 0,
          };

      const output = await retryAsync(
        async () => {
          attempts += 1;
          return tool.execute(parsed.data, context);
        },
        {
          attempts: retryPolicy.attempts,
          baseDelayMs: retryPolicy.baseDelayMs,
          maxDelayMs: retryPolicy.maxDelayMs,
          shouldRetry: (error) =>
            tool.idempotent &&
            (tool.isRetryableError?.(error) ?? isRetryableError(error)),
        },
      );
      return {
        toolCallId: request.id,
        toolName: request.toolName,
        ok: true,
        content: output,
        attempts,
      };
    } catch (error) {
      return {
        toolCallId: request.id,
        toolName: request.toolName,
        ok: false,
        content: "",
        error: error instanceof Error ? error.message : "Unknown tool failure",
        attempts,
      };
    }
  }
}
