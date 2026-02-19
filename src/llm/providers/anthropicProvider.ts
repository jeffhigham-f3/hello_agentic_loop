import { ProviderError } from "../../errors.js";
import type { ModelDecision } from "../../types.js";
import type { GenerateDecisionInput, LlmProviderAdapter } from "./types.js";

export class AnthropicProviderAdapter implements LlmProviderAdapter {
  readonly name = "anthropic";
  private readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async generateDecision(input: GenerateDecisionInput): Promise<ModelDecision> {
    if (!this.apiKey) {
      throw new ProviderError(
        "ANTHROPIC_API_KEY is not configured for anthropic provider.",
        false,
      );
    }

    throw new ProviderError(
      `Anthropic adapter scaffold is present but not implemented yet for model ${input.model}.`,
      false,
    );
  }
}
