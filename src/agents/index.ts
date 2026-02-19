import { countryHelloAgent } from "./builtins/countryHelloAgent.js";
import { echoAgent } from "./builtins/echoAgent.js";
import { interviewerAgent } from "./builtins/interviewerAgent.js";
import { InMemoryAgentRegistry } from "./registry.js";
import type { AgentRegistry } from "./registry.js";

export function createDefaultAgentRegistry(): AgentRegistry {
  const registry = new InMemoryAgentRegistry();
  registry.register(countryHelloAgent);
  registry.register(echoAgent);
  registry.register(interviewerAgent);
  return registry;
}

export { countryHelloAgent, echoAgent, interviewerAgent };
export type { AgentPlugin } from "./types.js";
