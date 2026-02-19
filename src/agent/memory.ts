import type { AgentMessage, AgentState } from "../types.js";

export function createInitialState(params: {
  agentId?: string;
  sessionId: string;
  systemPrompt: string;
  userInput: string;
  startedAtMs?: number;
}): AgentState {
  const startedAtMs = params.startedAtMs ?? Date.now();

  return {
    agentId: params.agentId,
    sessionId: params.sessionId,
    step: 0,
    toolCallsUsed: 0,
    startedAtMs,
    done: false,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userInput },
    ],
  };
}

export function appendMessage(state: AgentState, message: AgentMessage): void {
  state.messages.push(message);
}

export function markDone(state: AgentState, answer: string): void {
  state.done = true;
  state.finalAnswer = answer;
}
