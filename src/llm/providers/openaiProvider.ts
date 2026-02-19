import OpenAI from "openai";
import { ProviderError } from "../../errors.js";
import type { ModelDecision } from "../../types.js";
import { modelDecisionSchema } from "../schemas.js";
import type { GenerateDecisionInput, LlmProviderAdapter } from "./types.js";

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1]);
  }

  return JSON.parse(trimmed);
}

export class OpenAiProviderAdapter implements LlmProviderAdapter {
  readonly name = "openai";
  private readonly client: OpenAI | undefined;

  constructor(apiKey?: string) {
    this.client = apiKey ? new OpenAI({ apiKey }) : undefined;
  }

  async generateDecision(input: GenerateDecisionInput): Promise<ModelDecision> {
    if (!this.client) {
      throw new ProviderError(
        "OPENAI_API_KEY is not configured for openai provider.",
        false,
      );
    }

    const transcript = input.messages
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n");

    const userPrompt = [
      "Return only valid JSON with one action.",
      "Allowed actions: CALL_TOOL, ASK_USER, RESPOND, STOP.",
      'CALL_TOOL JSON: {"action":"CALL_TOOL","message":"...","toolCalls":[{"id":"...","toolName":"...","args":{},"reasoning":"..."}]}',
      'ASK_USER JSON: {"action":"ASK_USER","message":"..."}',
      'RESPOND JSON: {"action":"RESPOND","message":"..."}',
      'STOP JSON: {"action":"STOP","message":"..."}',
      "",
      "Conversation transcript:",
      transcript,
    ].join("\n");

    try {
      const response = await this.client.chat.completions.create({
        model: input.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a deterministic agent-loop decision engine. Output strict JSON only.",
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });

      const raw = response.choices[0]?.message?.content;
      if (!raw) {
        throw new ProviderError("OpenAI returned an empty completion.", true);
      }

      const parsed = parseJson(raw);
      return modelDecisionSchema.parse(parsed);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown OpenAI provider error";
      throw new ProviderError(`OpenAI adapter failed: ${message}`, true);
    }
  }
}
