import "dotenv/config";
import { createDefaultLlmClient } from "../llm/client.js";
import { loadConfig } from "../config.js";
import type { AgentMessage, ModelTarget } from "../types.js";

function classifyError(errorMessage: string): {
  label: string;
  guidance: string;
} {
  const lower = errorMessage.toLowerCase();
  if (lower.includes("429")) {
    return {
      label: "QUOTA_OR_RATE_LIMIT",
      guidance:
        "Your key worked, but the account/project has no available quota or hit rate limits. Check billing, usage tier, and project limits.",
    };
  }
  if (
    lower.includes("401") ||
    lower.includes("invalid api key") ||
    lower.includes("incorrect api key")
  ) {
    return {
      label: "AUTHENTICATION_ERROR",
      guidance:
        "The API key is missing, invalid, or from a different project/org. Verify OPENAI_API_KEY in .env and project assignment.",
    };
  }
  if (lower.includes("403")) {
    return {
      label: "PERMISSION_ERROR",
      guidance:
        "Request was authenticated but not authorized for this project/model. Check project, model access, and org permissions.",
    };
  }
  if (
    lower.includes("econn") ||
    lower.includes("enotfound") ||
    lower.includes("network") ||
    lower.includes("timeout")
  ) {
    return {
      label: "NETWORK_ERROR",
      guidance:
        "Network connectivity issue. Check internet access, DNS, proxy, or VPN settings and retry.",
    };
  }
  return {
    label: "UNKNOWN_ERROR",
    guidance:
      "Unexpected failure. Inspect full error details and OpenAI logs to diagnose.",
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.openAiApiKey) {
    process.stderr.write(
      "FAIL: OPENAI_API_KEY is not set in environment (.env).\n",
    );
    process.exitCode = 1;
    return;
  }

  const smokeModel =
    process.env.SMOKE_OPENAI_MODEL ||
    (config.primaryModel.provider === "openai"
      ? config.primaryModel.model
      : "gpt-4.1-mini");

  const target: ModelTarget = {
    provider: "openai",
    model: smokeModel,
  };

  const messages: AgentMessage[] = [
    {
      role: "system",
      content:
        "You are a smoke-test assistant. Return a simple decision immediately.",
    },
    {
      role: "user",
      content: "Say hello in one short sentence.",
    },
  ];

  const llmClient = createDefaultLlmClient({
    openAiApiKey: config.openAiApiKey,
    anthropicApiKey: config.anthropicApiKey,
  });

  process.stdout.write(
    `Running OpenAI smoke test with model '${target.model}'...\n`,
  );

  try {
    const decision = await llmClient.decideNextAction({
      target,
      messages,
    });
    process.stdout.write("PASS: OpenAI adapter returned a valid decision.\n");
    process.stdout.write(
      `Decision action: ${decision.action}${
        decision.action === "CALL_TOOL"
          ? ` (toolCalls=${decision.toolCalls.length})`
          : ""
      }\n`,
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown OpenAI error";
    const classified = classifyError(errorMessage);
    process.stderr.write(`FAIL: ${classified.label}\n`);
    process.stderr.write(`Details: ${errorMessage}\n`);
    process.stderr.write(`Guidance: ${classified.guidance}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : "Unknown smoke test failure";
  process.stderr.write(`FAIL: UNHANDLED_ERROR\nDetails: ${message}\n`);
  process.exitCode = 1;
});
