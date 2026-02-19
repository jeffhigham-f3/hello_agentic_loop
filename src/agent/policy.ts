import type { AgentConfig, AgentState, LoopResult } from "../types.js";

export interface PolicyCheck {
  stop: boolean;
  reason?: LoopResult["reason"];
}

export function evaluatePolicy(
  state: AgentState,
  config: AgentConfig,
  nowMs: number = Date.now(),
): PolicyCheck {
  if (state.done) {
    return { stop: true, reason: "completed" };
  }

  if (state.step >= config.maxSteps) {
    return { stop: true, reason: "max_steps" };
  }

  if (state.toolCallsUsed >= config.maxToolCalls) {
    return { stop: true, reason: "max_tool_calls" };
  }

  if (nowMs - state.startedAtMs >= config.timeoutMs) {
    return { stop: true, reason: "timeout" };
  }

  return { stop: false };
}
