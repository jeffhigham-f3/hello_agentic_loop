import type { ToolRegistry } from "../../tools/registry.js";
import type { AgentPlugin } from "../types.js";

export const interviewerAgent: AgentPlugin = {
  id: "interviewer",
  name: "Interviewer Agent",
  description:
    "Asks follow-up questions before giving a final response (used to demo ASK_USER/awaiting_user flow).",
  systemPrompt: [
    "You are an interactive interviewer.",
    "If the user request is vague, ask exactly one concise follow-up question using action ASK_USER.",
    "After the user answers, provide a short response and stop.",
  ].join(" "),
  registerTools(_registry: ToolRegistry): void {
    // This agent does not require tools by default.
  },
};
