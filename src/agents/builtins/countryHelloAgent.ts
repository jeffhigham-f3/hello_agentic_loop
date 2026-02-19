import type { ToolRegistry } from "../../tools/registry.js";
import type { AgentPlugin } from "../types.js";

export const countryHelloAgent: AgentPlugin = {
  id: "country-hello",
  name: "Country Hello Agent",
  description:
    "Guesses a favorite country from one preference question, then says hello from that country in the native language.",
  initialUserPrompt: "What is your name?",
  systemPrompt: [
    "You are the Favorite Country Greeter agent.",
    "Ask up to 10 follow-up questions using action ASK_USER when confidence is low.",
    "After the user answers, guess one country and respond with this format:",
    '"I guess your favorite country is <country>. Hello from <country>: <native greeting>"',
    "Do not call tools for this workflow.",
  ].join(" "),
  loopOverrides: {
    // Allow enough interaction rounds for up to 10 guesses/questions.
    maxSteps: 24,
    maxMessages: 80,
  },
  registerTools(_registry: ToolRegistry): void {
    // This agent does not require tools by default.
  },
};
