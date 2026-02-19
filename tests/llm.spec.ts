import { describe, expect, it } from "vitest";
import { ProviderError } from "../src/errors.js";
import {
  ProviderBackedLlmClient,
  RuleBasedLlmClient,
} from "../src/llm/client.js";
import type { LlmProviderAdapter } from "../src/llm/providers/types.js";

describe("LLM client provider adapters", () => {
  it("routes decisions through the rule-based provider", async () => {
    const client = new RuleBasedLlmClient();
    const result = await client.decideNextAction({
      target: { provider: "rule", model: "default" },
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.action).toBe("RESPOND");
    expect(result.message).toContain("rule/default");
  });

  it("throws when no adapter is registered for target provider", async () => {
    const client = new RuleBasedLlmClient();
    await expect(() =>
      client.decideNextAction({
        target: { provider: "openai", model: "gpt-4.1-mini" },
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toThrowError(ProviderError);
  });

  it("rejects duplicate provider adapter names", () => {
    const adapter: LlmProviderAdapter = {
      name: "duplicate",
      async generateDecision() {
        return { action: "RESPOND", message: "ok" };
      },
    };

    expect(() => new ProviderBackedLlmClient([adapter, adapter])).toThrow(
      "Duplicate provider adapter",
    );
  });
});
