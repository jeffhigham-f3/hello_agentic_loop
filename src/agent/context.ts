import type { AgentMessage } from "../types.js";

export function applyMessageWindow(
  messages: AgentMessage[],
  maxMessages: number,
): AgentMessage[] {
  if (messages.length <= maxMessages) {
    return messages;
  }

  if (maxMessages <= 1) {
    return messages.slice(-1);
  }

  const first = messages[0];
  const hasSystemMessage = first?.role === "system";

  if (!hasSystemMessage) {
    return messages.slice(-maxMessages);
  }

  const tail = messages.slice(-(maxMessages - 1));
  return [first, ...tail];
}

export function decisionSignature(input: unknown): string {
  try {
    return JSON.stringify(input);
  } catch {
    return "[unserializable-decision]";
  }
}
