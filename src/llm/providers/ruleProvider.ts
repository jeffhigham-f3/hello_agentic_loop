import { randomUUID } from "node:crypto";
import { ProviderError } from "../../errors.js";
import type { ModelDecision } from "../../types.js";
import { modelDecisionSchema } from "../schemas.js";
import type { GenerateDecisionInput, LlmProviderAdapter } from "./types.js";

export class RuleBasedProviderAdapter implements LlmProviderAdapter {
  readonly name = "rule";

  private guessCountryFromPreference(input: string): {
    country: string;
    greeting: string;
  } {
    const text = input.toLowerCase();
    if (
      /anime|manga|tokyo|sushi|tech|japan|onsen|neon|bullet train/.test(text)
    ) {
      return { country: "Japan", greeting: "こんにちは" };
    }
    if (/beach|tropical|island|carnival|rio|surf|warm water/.test(text)) {
      return { country: "Brazil", greeting: "Olá do Brasil" };
    }
    if (/romance|cafe|wine|museum|paris|art|fashion|france/.test(text)) {
      return { country: "France", greeting: "Bonjour de France" };
    }
    if (
      /mountain|northern lights|volcano|glacier|cold|hiking|iceland/.test(text)
    ) {
      return { country: "Iceland", greeting: "Halló frá Íslandi" };
    }
    if (/history|ruins|pasta|rome|italy|mediterranean/.test(text)) {
      return { country: "Italy", greeting: "Ciao dall'Italia" };
    }
    return { country: "Spain", greeting: "Hola desde España" };
  }

  async generateDecision(input: GenerateDecisionInput): Promise<ModelDecision> {
    if (input.model === "fail-primary") {
      throw new ProviderError("Primary model unavailable", true);
    }

    const lastMessage = input.messages[input.messages.length - 1];
    const content = lastMessage?.content ?? "";
    const systemPrompt =
      input.messages.find((message) => message.role === "system")?.content ??
      "";
    const isInterviewerAgent = /interactive interviewer/i.test(systemPrompt);
    const isCountryHelloAgent = /favorite country greeter/i.test(systemPrompt);

    if (lastMessage?.role === "tool") {
      const decision: ModelDecision = {
        action: "RESPOND",
        message: `Tool completed successfully. Result: ${content}`,
      };
      return modelDecisionSchema.parse(decision);
    }

    if (isInterviewerAgent && lastMessage?.role === "user") {
      const askedBefore = input.messages.some(
        (message) =>
          message.role === "assistant" &&
          message.content.includes(
            "What kind of vacation spot do you like most",
          ),
      );

      if (!askedBefore) {
        const decision: ModelDecision = {
          action: "ASK_USER",
          message:
            "What kind of vacation spot do you like most: beach, city, mountains, or something else?",
        };
        return modelDecisionSchema.parse(decision);
      }

      const decision: ModelDecision = {
        action: "RESPOND",
        message: `Thanks, that helps. You said "${content}". I can now continue with a destination-guessing workflow.`,
      };
      return modelDecisionSchema.parse(decision);
    }

    if (isCountryHelloAgent && lastMessage?.role === "user") {
      const askedBefore = input.messages.some(
        (message) =>
          message.role === "assistant" &&
          message.content.includes(
            "Which travel vibe feels most like you right now",
          ),
      );

      if (!askedBefore) {
        const decision: ModelDecision = {
          action: "ASK_USER",
          message:
            "Which travel vibe feels most like you right now: beach, culture, mountains, city, or food?",
        };
        return modelDecisionSchema.parse(decision);
      }

      const guess = this.guessCountryFromPreference(content);
      const decision: ModelDecision = {
        action: "RESPOND",
        message: `I guess your favorite country is ${guess.country}. Hello from ${guess.country}: ${guess.greeting}`,
      };
      return modelDecisionSchema.parse(decision);
    }

    const match = content.match(/echo:\s*(.+)$/i);
    if (match?.[1]) {
      const decision: ModelDecision = {
        action: "CALL_TOOL",
        message: "Using the echo tool to verify tool-calling flow.",
        toolCalls: [
          {
            id: randomUUID(),
            toolName: "echo",
            args: { text: match[1] },
            reasoning: "User requested an echo operation.",
          },
        ],
      };
      return modelDecisionSchema.parse(decision);
    }

    const decision: ModelDecision = {
      action: "RESPOND",
      message: `Agent loop foundation is initialized on rule/${input.model}. Use input like \`echo: hello\` to trigger a tool call.`,
    };
    return modelDecisionSchema.parse(decision);
  }
}
