import { describe, expect, it } from "vitest";
import type { LlmClient } from "../src/llm/client.js";
import { RuleBasedLlmClient } from "../src/llm/client.js";
import { runLoop } from "../src/agent/loop.js";
import { createDefaultAgentRegistry } from "../src/agents/index.js";
import { InMemoryToolRegistry } from "../src/tools/registry.js";
import { echoTool } from "../src/tools/builtins/echo.js";
import type { AgentConfig } from "../src/types.js";

function baseConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    primaryModel: { provider: "rule", model: "default" },
    fallbackModels: [],
    maxSteps: 4,
    maxToolCalls: 2,
    timeoutMs: 10_000,
    maxMessages: 20,
    maxRepeatedDecisionSignatures: 2,
    ...overrides,
  };
}

describe("runLoop", () => {
  it("completes a no-op turn with a direct response", async () => {
    const registry = new InMemoryToolRegistry();
    registry.register(echoTool);

    const result = await runLoop({
      sessionId: "session-test",
      systemPrompt: "You are a test assistant.",
      userInput: "hello",
      config: baseConfig(),
      deps: {
        llmClient: new RuleBasedLlmClient(),
        toolRegistry: registry,
      },
    });

    expect(result.reason).toBe("completed");
    expect(result.state.step).toBe(1);
    expect(result.state.finalAnswer).toContain("foundation is initialized");
  });

  it("stops when max tool calls are exhausted", async () => {
    let counter = 0;
    const alwaysToolClient: LlmClient = {
      async decideNextAction() {
        counter += 1;
        return {
          action: "CALL_TOOL",
          toolCalls: [
            { id: String(counter), toolName: "echo", args: { text: "x" } },
          ],
          message: "Calling tool",
        };
      },
    };

    const registry = new InMemoryToolRegistry();
    registry.register(echoTool);

    const result = await runLoop({
      sessionId: "session-max-tools",
      systemPrompt: "You are a test assistant.",
      userInput: "trigger tools",
      config: baseConfig({ maxSteps: 10, maxToolCalls: 1 }),
      deps: {
        llmClient: alwaysToolClient,
        toolRegistry: registry,
      },
    });

    expect(result.reason).toBe("max_tool_calls");
    expect(result.state.toolCallsUsed).toBe(1);
  });

  it("returns policy_stop when model emits STOP action", async () => {
    const stopClient: LlmClient = {
      async decideNextAction() {
        return {
          action: "STOP",
          message: "Stopping intentionally for policy reasons.",
        };
      },
    };

    const registry = new InMemoryToolRegistry();
    registry.register(echoTool);

    const result = await runLoop({
      sessionId: "session-stop",
      systemPrompt: "You are a test assistant.",
      userInput: "stop",
      config: baseConfig(),
      deps: {
        llmClient: stopClient,
        toolRegistry: registry,
      },
    });

    expect(result.reason).toBe("policy_stop");
    expect(result.state.finalAnswer).toContain("Stopping intentionally");
  });

  it("uses fallback model when primary fails", async () => {
    const registry = new InMemoryToolRegistry();
    registry.register(echoTool);

    const result = await runLoop({
      sessionId: "session-fallback",
      systemPrompt: "You are a test assistant.",
      userInput: "hello",
      config: baseConfig({
        primaryModel: { provider: "rule", model: "fail-primary" },
        fallbackModels: [{ provider: "rule", model: "default" }],
      }),
      deps: {
        llmClient: new RuleBasedLlmClient(),
        toolRegistry: registry,
      },
    });

    expect(result.reason).toBe("completed");
    expect(result.state.finalAnswer).toContain("rule/default");
  });

  it("stops immediately when timeout is reached", async () => {
    const registry = new InMemoryToolRegistry();
    registry.register(echoTool);

    const result = await runLoop({
      sessionId: "session-timeout",
      systemPrompt: "You are a test assistant.",
      userInput: "hello",
      config: baseConfig({ timeoutMs: 0 }),
      deps: {
        llmClient: new RuleBasedLlmClient(),
        toolRegistry: registry,
      },
    });

    expect(result.reason).toBe("timeout");
    expect(result.state.step).toBe(0);
  });

  it("returns awaiting_user and can resume with follow-up input", async () => {
    let invocation = 0;
    const askThenRespondClient: LlmClient = {
      async decideNextAction() {
        invocation += 1;
        if (invocation === 1) {
          return {
            action: "ASK_USER",
            message: "Which destination style do you prefer?",
          };
        }
        return {
          action: "RESPOND",
          message: "Great, thanks for clarifying.",
        };
      },
    };

    const registry = new InMemoryToolRegistry();
    registry.register(echoTool);

    const first = await runLoop({
      agentId: "interviewer",
      sessionId: "session-awaiting-user",
      systemPrompt: "You are an interviewer.",
      userInput: "help me pick a destination",
      config: baseConfig(),
      deps: {
        llmClient: askThenRespondClient,
        toolRegistry: registry,
      },
    });

    expect(first.reason).toBe("awaiting_user");
    expect(first.state.done).toBe(false);
    first.state.startedAtMs = 0;

    const resumed = await runLoop({
      sessionId: "session-awaiting-user",
      state: first.state,
      userInput: "Beach and warm weather",
      config: baseConfig(),
      deps: {
        llmClient: askThenRespondClient,
        toolRegistry: registry,
      },
    });

    expect(resumed.reason).toBe("completed");
    expect(resumed.state.finalAnswer).toContain("Great, thanks");
  });

  it("country-hello agent asks then responds with native greeting", async () => {
    const registry = createDefaultAgentRegistry();
    const agent = registry.get("country-hello");
    expect(agent).toBeDefined();
    if (!agent) {
      return;
    }

    const toolRegistry = new InMemoryToolRegistry();
    agent.registerTools(toolRegistry);

    const client = new RuleBasedLlmClient();
    const first = await runLoop({
      agentId: agent.id,
      sessionId: "session-country-hello",
      systemPrompt: agent.systemPrompt,
      userInput: "Help me guess my favorite country",
      config: baseConfig(),
      deps: {
        llmClient: client,
        toolRegistry,
      },
    });

    expect(first.reason).toBe("awaiting_user");
    const resumed = await runLoop({
      sessionId: "session-country-hello",
      state: first.state,
      userInput: "I love anime, sushi, and futuristic cities.",
      config: baseConfig(),
      deps: {
        llmClient: client,
        toolRegistry,
      },
    });

    expect(resumed.reason).toBe("completed");
    expect(resumed.state.finalAnswer).toContain(
      "I guess your favorite country",
    );
    expect(resumed.state.finalAnswer).toContain("Hello from Japan: こんにちは");
  });
});
