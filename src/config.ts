import { z } from "zod";
import type { AgentConfig } from "./types.js";

const envSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_PROVIDER: z.string().default("rule"),
  LLM_MODEL: z.string().default("default"),
  LLM_FALLBACK_MODELS: z.string().optional(),
  LOOP_MAX_STEPS: z.coerce.number().int().positive().default(6),
  LOOP_MAX_TOOL_CALLS: z.coerce.number().int().positive().default(4),
  LOOP_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  LOOP_MAX_MESSAGES: z.coerce.number().int().positive().default(30),
  LOOP_MAX_REPEAT_DECISION_SIGNATURES: z.coerce
    .number()
    .int()
    .positive()
    .default(2),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export interface AppConfig extends AgentConfig {
  openAiApiKey?: string;
  anthropicApiKey?: string;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
}

function parseFallbackModels(
  fallbackString: string | undefined,
  defaultProvider: string,
): AgentConfig["fallbackModels"] {
  if (!fallbackString) {
    return [];
  }

  return fallbackString
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .flatMap((entry) => {
      if (entry.includes(":")) {
        const [provider, model] = entry.split(":", 2);
        if (!provider || !model) {
          return [];
        }
        return [
          {
            provider: provider.trim(),
            model: model.trim(),
          },
        ];
      }

      return [
        {
          provider: defaultProvider,
          model: entry,
        },
      ];
    });
}

export function loadConfig(
  rawEnv: Record<string, string | undefined> = process.env,
): AppConfig {
  const parsed = envSchema.parse(rawEnv);
  const config: AppConfig = {
    primaryModel: {
      provider: parsed.LLM_PROVIDER,
      model: parsed.LLM_MODEL,
    },
    fallbackModels: parseFallbackModels(
      parsed.LLM_FALLBACK_MODELS,
      parsed.LLM_PROVIDER,
    ),
    maxSteps: parsed.LOOP_MAX_STEPS,
    maxToolCalls: parsed.LOOP_MAX_TOOL_CALLS,
    timeoutMs: parsed.LOOP_TIMEOUT_MS,
    maxMessages: parsed.LOOP_MAX_MESSAGES,
    maxRepeatedDecisionSignatures: parsed.LOOP_MAX_REPEAT_DECISION_SIGNATURES,
    logLevel: parsed.LOG_LEVEL,
  };

  if (parsed.OPENAI_API_KEY) {
    config.openAiApiKey = parsed.OPENAI_API_KEY;
  }
  if (parsed.ANTHROPIC_API_KEY) {
    config.anthropicApiKey = parsed.ANTHROPIC_API_KEY;
  }

  return config;
}
