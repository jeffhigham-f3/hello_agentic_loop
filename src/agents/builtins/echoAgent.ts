import { baseSystemPrompt } from "../../prompts/system.js";
import { echoTool } from "../../tools/builtins/echo.js";
import type { ToolRegistry } from "../../tools/registry.js";
import type { AgentPlugin } from "../types.js";

export const echoAgent: AgentPlugin = {
  id: "echo",
  name: "Echo Agent",
  description:
    "General-purpose starter agent with the echo tool enabled for loop/tool demos.",
  systemPrompt: baseSystemPrompt,
  registerTools(registry: ToolRegistry): void {
    registry.register(echoTool);
  },
};
