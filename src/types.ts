export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ModelTarget {
  provider: string;
  model: string;
}

export interface AgentMessage {
  role: MessageRole;
  content: string;
  name?: string | undefined;
  toolCallId?: string | undefined;
}

export type AgentAction =
  | "ASK_ONE_QUESTION"
  | "CALL_TOOL"
  | "RESPOND"
  | "ASK_USER"
  | "STOP";

export interface AgentConfig {
  maxSteps: number;
  maxToolCalls: number;
  timeoutMs: number;
  maxMessages: number;
  maxRepeatedDecisionSignatures: number;
  primaryModel: ModelTarget;
  fallbackModels: ModelTarget[];
}

export interface ToolCallRequest {
  id: string;
  toolName: string;
  args: unknown;
  reasoning?: string | undefined;
}

export interface ToolCallResult {
  toolCallId: string;
  toolName: string;
  ok: boolean;
  content: string;
  error?: string | undefined;
  attempts: number;
}

export type ModelDecision =
  | {
      action: "RESPOND" | "STOP";
      message: string;
      toolCalls?: never;
    }
  | {
      action: "ASK_USER";
      message: string;
      toolCalls?: never;
    }
  | {
      action: "CALL_TOOL";
      message?: string | undefined;
      toolCalls: ToolCallRequest[];
    };

export interface AgentState {
  agentId?: string | undefined;
  sessionId: string;
  step: number;
  toolCallsUsed: number;
  startedAtMs: number;
  done: boolean;
  messages: AgentMessage[];
  finalAnswer?: string | undefined;
}

export interface LoopResult {
  state: AgentState;
  reason:
    | "completed"
    | "awaiting_user"
    | "max_steps"
    | "max_tool_calls"
    | "timeout"
    | "policy_stop"
    | "error";
}
