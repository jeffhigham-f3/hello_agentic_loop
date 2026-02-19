import { describe, expect, it } from "vitest";
import { createDefaultAgentRegistry } from "../src/agents/index.js";
import { InMemoryAgentRegistry } from "../src/agents/registry.js";
import { echoAgent } from "../src/agents/builtins/echoAgent.js";

describe("agent registry", () => {
  it("loads built-in agents", () => {
    const registry = createDefaultAgentRegistry();
    const ids = registry.list().map((agent) => agent.id);
    expect(ids).toContain("country-hello");
    expect(ids).toContain("echo");
    expect(ids).toContain("interviewer");
  });

  it("rejects duplicate agent registration", () => {
    const registry = new InMemoryAgentRegistry();
    registry.register(echoAgent);
    expect(() => registry.register(echoAgent)).toThrow(
      "Agent already registered",
    );
  });
});
