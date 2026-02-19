import { ValidationError } from "../errors.js";
import type { AgentPlugin } from "./types.js";

export interface AgentRegistry {
  register(agent: AgentPlugin): void;
  get(agentId: string): AgentPlugin | undefined;
  list(): AgentPlugin[];
}

export class InMemoryAgentRegistry implements AgentRegistry {
  private readonly agents = new Map<string, AgentPlugin>();

  register(agent: AgentPlugin): void {
    if (this.agents.has(agent.id)) {
      throw new ValidationError(`Agent already registered: ${agent.id}`);
    }
    this.agents.set(agent.id, agent);
  }

  get(agentId: string): AgentPlugin | undefined {
    return this.agents.get(agentId);
  }

  list(): AgentPlugin[] {
    return [...this.agents.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
}
