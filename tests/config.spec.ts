import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("applies defaults when env is missing", () => {
    const config = loadConfig({});

    expect(config.primaryModel.provider).toBe("rule");
    expect(config.primaryModel.model).toBe("default");
    expect(config.fallbackModels).toEqual([]);
    expect(config.maxSteps).toBe(6);
    expect(config.maxToolCalls).toBe(4);
    expect(config.timeoutMs).toBe(30_000);
    expect(config.maxMessages).toBe(30);
    expect(config.maxRepeatedDecisionSignatures).toBe(2);
    expect(config.logLevel).toBe("info");
  });

  it("accepts valid overrides", () => {
    const config = loadConfig({
      OPENAI_API_KEY: "openai-key",
      ANTHROPIC_API_KEY: "anthropic-key",
      LLM_PROVIDER: "openai",
      LLM_MODEL: "demo-model",
      LLM_FALLBACK_MODELS: "openai:backup-model,rule:default",
      LOOP_MAX_STEPS: "9",
      LOOP_MAX_TOOL_CALLS: "3",
      LOOP_TIMEOUT_MS: "12000",
      LOOP_MAX_MESSAGES: "40",
      LOOP_MAX_REPEAT_DECISION_SIGNATURES: "5",
      LOG_LEVEL: "debug",
    });

    expect(config.primaryModel).toEqual({
      provider: "openai",
      model: "demo-model",
    });
    expect(config.fallbackModels).toEqual([
      { provider: "openai", model: "backup-model" },
      { provider: "rule", model: "default" },
    ]);
    expect(config.maxSteps).toBe(9);
    expect(config.maxToolCalls).toBe(3);
    expect(config.timeoutMs).toBe(12_000);
    expect(config.maxMessages).toBe(40);
    expect(config.maxRepeatedDecisionSignatures).toBe(5);
    expect(config.logLevel).toBe("debug");
    expect(config.openAiApiKey).toBe("openai-key");
    expect(config.anthropicApiKey).toBe("anthropic-key");
  });

  it("throws for invalid numeric limits", () => {
    expect(() =>
      loadConfig({
        LOOP_MAX_STEPS: "-1",
      }),
    ).toThrow();
  });
});
