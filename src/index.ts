import "dotenv/config";
import { randomUUID } from "node:crypto";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { loadConfig } from "./config.js";
import { runLoop } from "./agent/loop.js";
import { createDefaultLlmClient } from "./llm/client.js";
import { createDefaultAgentRegistry } from "./agents/index.js";
import { InMemoryToolRegistry } from "./tools/registry.js";
import { createLogger } from "./observability/logger.js";
import { InMemoryMetricsCollector } from "./observability/metrics.js";
import type { AgentMessage, AgentState } from "./types.js";

interface CliArgs {
  listAgents: boolean;
  agentId: string;
  initialInput: string;
}

function parseCliArgs(argv: string[]): CliArgs {
  let listAgents = false;
  let agentId = "echo";
  const messageParts: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) {
      continue;
    }
    if (arg === "--list-agents") {
      listAgents = true;
      continue;
    }

    if (arg === "--agent") {
      const nextValue = argv[i + 1];
      if (nextValue) {
        agentId = nextValue;
        i += 1;
      }
      continue;
    }

    messageParts.push(arg);
  }

  return {
    listAgents,
    agentId,
    initialInput: messageParts.join(" ").trim(),
  };
}

function getLastAssistantMessage(messages: AgentMessage[]): string {
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  return lastAssistant?.content ?? "";
}

async function promptForInput(message: string): Promise<string> {
  try {
    const inquirerModule = await import("@inquirer/prompts");
    return await inquirerModule.input({ message });
  } catch {
    const rl = createInterface({ input, output });
    try {
      return await rl.question(`${message} `);
    } finally {
      rl.close();
    }
  }
}

async function main(): Promise<void> {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  const agentRegistry = createDefaultAgentRegistry();
  if (cliArgs.listAgents) {
    const lines = agentRegistry
      .list()
      .map((agent) => `- ${agent.id}: ${agent.description}`);
    process.stdout.write(`${lines.join("\n")}\n`);
    return;
  }

  const selectedAgent = agentRegistry.get(cliArgs.agentId);
  if (!selectedAgent) {
    const available = agentRegistry
      .list()
      .map((agent) => agent.id)
      .join(", ");
    process.stderr.write(
      `Unknown agent '${cliArgs.agentId}'. Available agents: ${available}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const metrics = new InMemoryMetricsCollector();
  const llmClient = createDefaultLlmClient({
    openAiApiKey: config.openAiApiKey,
    anthropicApiKey: config.anthropicApiKey,
  });
  const runConfig = {
    ...config,
    ...(selectedAgent.loopOverrides ?? {}),
  };
  const toolRegistry = new InMemoryToolRegistry();
  selectedAgent.registerTools(toolRegistry);
  const sessionId = randomUUID();
  let currentState: AgentState | undefined;
  let nextInput =
    cliArgs.initialInput ||
    (await promptForInput(selectedAgent.initialUserPrompt ?? "You:"));

  while (true) {
    const runInput: Parameters<typeof runLoop>[0] = {
      agentId: selectedAgent.id,
      sessionId,
      userInput: nextInput,
      config,
      deps: { llmClient, toolRegistry, logger, metrics },
    };
    runInput.config = runConfig;
    if (!currentState) {
      runInput.systemPrompt = selectedAgent.systemPrompt;
    } else {
      runInput.state = currentState;
    }

    const result = await runLoop(runInput);

    currentState = result.state;
    if (result.reason === "awaiting_user") {
      const assistantMessage = getLastAssistantMessage(result.state.messages);
      if (assistantMessage) {
        process.stdout.write(`${selectedAgent.name}: ${assistantMessage}\n`);
      }
      nextInput = await promptForInput("You:");
      continue;
    }

    logger.info(
      {
        agentId: selectedAgent.id,
        reason: result.reason,
        steps: result.state.step,
        toolCallsUsed: result.state.toolCallsUsed,
        metrics: metrics.snapshot().counters,
      },
      "run.summary",
    );

    process.stdout.write(`${result.state.finalAnswer ?? "No final answer"}\n`);
    break;
  }
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : "Unknown startup error";
  process.stderr.write(`Startup failed: ${message}\n`);
  process.exitCode = 1;
});
