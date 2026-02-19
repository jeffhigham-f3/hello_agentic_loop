import type { ToolRegistry } from "../tools/registry.js";
import type { AgentConfig } from "../types.js";

export interface AgentLoopOverrides extends Partial<
  Pick<
    AgentConfig,
    | "maxSteps"
    | "maxToolCalls"
    | "timeoutMs"
    | "maxMessages"
    | "maxRepeatedDecisionSignatures"
  >
> {}

export interface AgentPlugin {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  initialUserPrompt?: string | undefined;
  loopOverrides?: AgentLoopOverrides | undefined;
  registerTools(registry: ToolRegistry): void;
}
