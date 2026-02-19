import { ProviderError } from "../errors.js";
import type { AgentMessage, ModelDecision, ModelTarget } from "../types.js";
import { AnthropicProviderAdapter } from "./providers/anthropicProvider.js";
import { OpenAiProviderAdapter } from "./providers/openaiProvider.js";
import { RuleBasedProviderAdapter } from "./providers/ruleProvider.js";
import type { LlmProviderAdapter } from "./providers/types.js";

export interface DecideNextActionInput {
  target: ModelTarget;
  messages: AgentMessage[];
}

export interface LlmClient {
  decideNextAction(input: DecideNextActionInput): Promise<ModelDecision>;
}

export class ProviderBackedLlmClient implements LlmClient {
  private readonly adapters = new Map<string, LlmProviderAdapter>();

  constructor(providerAdapters: LlmProviderAdapter[]) {
    for (const adapter of providerAdapters) {
      if (this.adapters.has(adapter.name)) {
        throw new ProviderError(`Duplicate provider adapter: ${adapter.name}`);
      }
      this.adapters.set(adapter.name, adapter);
    }
  }

  listProviders(): string[] {
    return [...this.adapters.keys()];
  }

  async decideNextAction(input: DecideNextActionInput): Promise<ModelDecision> {
    const adapter = this.adapters.get(input.target.provider);
    if (!adapter) {
      throw new ProviderError(
        `No provider adapter registered for '${input.target.provider}'.`,
      );
    }

    return adapter.generateDecision({
      model: input.target.model,
      messages: input.messages,
    });
  }
}

export class RuleBasedLlmClient extends ProviderBackedLlmClient {
  constructor() {
    super([new RuleBasedProviderAdapter()]);
  }
}

export interface LlmClientFactoryOptions {
  openAiApiKey?: string | undefined;
  anthropicApiKey?: string | undefined;
}

export function createDefaultLlmClient(
  options: LlmClientFactoryOptions = {},
): ProviderBackedLlmClient {
  return new ProviderBackedLlmClient([
    new RuleBasedProviderAdapter(),
    new OpenAiProviderAdapter(options.openAiApiKey),
    new AnthropicProviderAdapter(options.anthropicApiKey),
  ]);
}
