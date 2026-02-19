import { describe, expect, it } from "vitest";
import { z } from "zod";
import { InMemoryToolRegistry } from "../src/tools/registry.js";
import { echoTool } from "../src/tools/builtins/echo.js";
import type { ToolDefinition } from "../src/tools/contracts.js";
import { ToolExecutionError } from "../src/errors.js";

describe("InMemoryToolRegistry", () => {
  it("executes a registered tool successfully", async () => {
    const registry = new InMemoryToolRegistry();
    registry.register(echoTool);

    const result = await registry.execute({
      id: "call-1",
      toolName: "echo",
      args: { text: "hello" },
    });

    expect(result.ok).toBe(true);
    expect(result.content).toBe("hello");
  });

  it("returns a validation error for invalid args", async () => {
    const registry = new InMemoryToolRegistry();
    registry.register(echoTool);

    const result = await registry.execute({
      id: "call-2",
      toolName: "echo",
      args: { text: "" },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns a not-found error for unknown tools", async () => {
    const registry = new InMemoryToolRegistry();
    const result = await registry.execute({
      id: "call-3",
      toolName: "missing_tool",
      args: {},
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Tool not found");
  });

  it("does not retry non-idempotent tools", async () => {
    const registry = new InMemoryToolRegistry();
    let attempts = 0;
    const writeTool: ToolDefinition<{ payload: string }> = {
      name: "write_record",
      description: "Simulates a side-effecting write action.",
      inputSchema: z.object({ payload: z.string() }),
      idempotent: false,
      retryPolicy: {
        attempts: 3,
        baseDelayMs: 1,
        maxDelayMs: 1,
      },
      async execute(): Promise<string> {
        attempts += 1;
        throw new ToolExecutionError("write failed", true);
      },
    };
    registry.register(writeTool);

    const result = await registry.execute({
      id: "call-4",
      toolName: "write_record",
      args: { payload: "abc" },
    });

    expect(result.ok).toBe(false);
    expect(attempts).toBe(1);
  });

  it("retries idempotent transient failures", async () => {
    const registry = new InMemoryToolRegistry();
    let attempts = 0;
    const flakyReadTool: ToolDefinition<{ key: string }> = {
      name: "read_record",
      description: "Simulates a retryable read action.",
      inputSchema: z.object({ key: z.string() }),
      idempotent: true,
      retryPolicy: {
        attempts: 3,
        baseDelayMs: 1,
        maxDelayMs: 2,
      },
      async execute(): Promise<string> {
        attempts += 1;
        if (attempts < 2) {
          throw new ToolExecutionError("temporary backend failure", true);
        }
        return "ok";
      },
    };
    registry.register(flakyReadTool);

    const result = await registry.execute({
      id: "call-5",
      toolName: "read_record",
      args: { key: "x" },
    });

    expect(result.ok).toBe(true);
    expect(result.content).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("rejects duplicate tool registration", () => {
    const registry = new InMemoryToolRegistry();
    registry.register(echoTool);
    expect(() => registry.register(echoTool)).toThrow(
      "Tool already registered",
    );
  });
});
