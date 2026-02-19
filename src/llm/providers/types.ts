import type { AgentMessage, ModelDecision } from "../../types.js";

export interface GenerateDecisionInput {
  model: string;
  messages: AgentMessage[];
}

export interface LlmProviderAdapter {
  readonly name: string;
  generateDecision(input: GenerateDecisionInput): Promise<ModelDecision>;
}
