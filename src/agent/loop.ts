import { appendMessage, createInitialState, markDone } from "./memory.js";
import { applyMessageWindow, decisionSignature } from "./context.js";
import { evaluatePolicy } from "./policy.js";
import type { LlmClient } from "../llm/client.js";
import { StaticModelRouter, type ModelRouter } from "../llm/router.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { AgentConfig, AgentState, LoopResult } from "../types.js";
import {
  logger as defaultLogger,
  type AppLogger,
} from "../observability/logger.js";
import {
  InMemoryMetricsCollector,
  type MetricsCollector,
} from "../observability/metrics.js";
import { isRetryableError, ProviderError } from "../errors.js";
import { retryAsync } from "../utils/retry.js";

export interface LoopDependencies {
  llmClient: LlmClient;
  toolRegistry: ToolRegistry;
  modelRouter?: ModelRouter;
  metrics?: MetricsCollector;
  logger?: AppLogger;
  onStep?: (stepNumber: number) => void;
}

export interface RunLoopInput {
  agentId?: string;
  sessionId: string;
  systemPrompt?: string;
  userInput?: string;
  state?: AgentState;
  config: AgentConfig;
  deps: LoopDependencies;
}

export async function runLoop(input: RunLoopInput): Promise<LoopResult> {
  const activeLogger = input.deps.logger ?? defaultLogger;
  const activeMetrics = input.deps.metrics ?? new InMemoryMetricsCollector();
  const modelRouter =
    input.deps.modelRouter ??
    new StaticModelRouter(
      input.config.primaryModel,
      input.config.fallbackModels,
    );
  let state: AgentState;
  if (input.state) {
    state = input.state;
    // Reset active window on resume so human wait time between turns
    // does not consume the loop timeout budget.
    state.startedAtMs = Date.now();
    if (input.userInput?.trim()) {
      appendMessage(state, { role: "user", content: input.userInput });
    }
  } else {
    if (!input.systemPrompt) {
      throw new ProviderError("systemPrompt is required for initial loop run.");
    }
    if (!input.userInput?.trim()) {
      throw new ProviderError("userInput is required for initial loop run.");
    }
    const initialStateParams: Parameters<typeof createInitialState>[0] = {
      sessionId: input.sessionId,
      systemPrompt: input.systemPrompt,
      userInput: input.userInput,
    };
    if (input.agentId) {
      initialStateParams.agentId = input.agentId;
    }
    state = createInitialState(initialStateParams);
  }
  let repeatedDecisionCount = 0;
  let lastDecisionSig: string | undefined;

  if (!input.state) {
    activeLogger.info(
      {
        agentId: state.agentId,
        sessionId: state.sessionId,
        maxSteps: input.config.maxSteps,
        maxToolCalls: input.config.maxToolCalls,
        timeoutMs: input.config.timeoutMs,
        primaryModel: input.config.primaryModel,
        fallbackModels: input.config.fallbackModels,
      },
      "loop.start",
    );
    activeMetrics.increment("loop_started_total", 1, {
      agentId: state.agentId ?? "unknown",
    });
  } else {
    activeMetrics.increment("loop_resumed_total", 1, {
      agentId: state.agentId ?? "unknown",
    });
  }

  try {
    while (true) {
      const policyCheck = evaluatePolicy(state, input.config);
      if (policyCheck.stop) {
        activeLogger.info(
          {
            sessionId: state.sessionId,
            reason: policyCheck.reason,
            step: state.step,
          },
          "loop.stop",
        );
        activeMetrics.increment("loop_stopped_total", 1, {
          reason: policyCheck.reason ?? "policy_stop",
        });
        return {
          state,
          reason: policyCheck.reason ?? "policy_stop",
        };
      }

      state.step += 1;
      input.deps.onStep?.(state.step);
      activeMetrics.increment("loop_steps_total");
      activeLogger.debug(
        { sessionId: state.sessionId, step: state.step },
        "loop.step",
      );
      const trimmedMessages = applyMessageWindow(
        state.messages,
        input.config.maxMessages,
      );

      const modelRoute = modelRouter.getRoute();
      let lastError: unknown;
      let selectedModel = input.config.primaryModel;
      let decision: Awaited<ReturnType<LlmClient["decideNextAction"]>> | null =
        null;

      for (const [modelIndex, target] of modelRoute.entries()) {
        selectedModel = target;
        const startedMs = Date.now();

        try {
          decision = await retryAsync(
            () =>
              input.deps.llmClient.decideNextAction({
                target,
                messages: trimmedMessages,
              }),
            {
              attempts: 2,
              baseDelayMs: 100,
              maxDelayMs: 500,
              shouldRetry: isRetryableError,
            },
          );

          activeMetrics.timing("llm_latency_ms", Date.now() - startedMs, {
            provider: target.provider,
            model: target.model,
          });

          if (modelIndex > 0) {
            activeMetrics.increment("llm_fallback_success_total", 1, {
              modelIndex,
            });
            activeLogger.warn(
              {
                sessionId: state.sessionId,
                step: state.step,
                fallbackIndex: modelIndex,
                model: target,
              },
              "loop.model_fallback_success",
            );
          }

          break;
        } catch (error) {
          lastError = error;
          activeMetrics.increment("llm_failures_total", 1, {
            provider: target.provider,
            model: target.model,
          });
          activeLogger.warn(
            {
              sessionId: state.sessionId,
              step: state.step,
              model: target,
              error:
                error instanceof Error ? error.message : "Unknown model error",
            },
            "loop.model_attempt_failed",
          );
        }
      }

      if (!decision) {
        throw new ProviderError(
          `All model attempts failed. Last error: ${
            lastError instanceof Error ? lastError.message : "unknown"
          }`,
          false,
        );
      }

      activeLogger.debug(
        {
          sessionId: state.sessionId,
          step: state.step,
          model: selectedModel,
          action: decision.action,
          toolCallCount:
            decision.action === "CALL_TOOL" ? decision.toolCalls.length : 0,
        },
        "loop.decision",
      );

      if (decision.action === "CALL_TOOL") {
        if (decision.message) {
          appendMessage(state, {
            role: "assistant",
            content: decision.message,
          });
        }
        const currentDecisionSig = decisionSignature(
          decision.toolCalls.map((item) => ({
            toolName: item.toolName,
            args: item.args,
          })),
        );
        if (currentDecisionSig === lastDecisionSig) {
          repeatedDecisionCount += 1;
        } else {
          repeatedDecisionCount = 0;
          lastDecisionSig = currentDecisionSig;
        }

        if (
          repeatedDecisionCount >= input.config.maxRepeatedDecisionSignatures
        ) {
          const stopMessage =
            "Stopping loop after repeated identical tool decisions.";
          appendMessage(state, { role: "assistant", content: stopMessage });
          markDone(state, stopMessage);
          activeMetrics.increment("loop_stopped_total", 1, {
            reason: "policy_stop",
          });
          activeLogger.warn(
            {
              sessionId: state.sessionId,
              step: state.step,
              repeatedDecisionCount,
            },
            "loop.repeated_decision_stop",
          );
          return { state, reason: "policy_stop" };
        }

        for (const toolCall of decision.toolCalls) {
          if (state.toolCallsUsed >= input.config.maxToolCalls) {
            activeLogger.warn(
              { sessionId: state.sessionId, step: state.step },
              "loop.max_tool_calls_reached",
            );
            activeMetrics.increment("loop_stopped_total", 1, {
              reason: "max_tool_calls",
            });
            return { state, reason: "max_tool_calls" };
          }

          const toolStartedMs = Date.now();
          const toolResult = await input.deps.toolRegistry.execute(toolCall, {
            sessionId: state.sessionId,
            step: state.step,
          });
          state.toolCallsUsed += 1;
          activeMetrics.increment("tool_calls_total", 1, {
            tool: toolResult.toolName,
            ok: toolResult.ok,
          });
          activeMetrics.timing("tool_latency_ms", Date.now() - toolStartedMs, {
            tool: toolResult.toolName,
            ok: toolResult.ok,
          });
          if (!toolResult.ok) {
            activeMetrics.increment("tool_failures_total", 1, {
              tool: toolResult.toolName,
            });
          }

          activeLogger.info(
            {
              sessionId: state.sessionId,
              step: state.step,
              toolName: toolResult.toolName,
              toolCallId: toolResult.toolCallId,
              ok: toolResult.ok,
              attempts: toolResult.attempts,
            },
            "loop.tool_result",
          );

          appendMessage(state, {
            role: "tool",
            name: toolResult.toolName,
            toolCallId: toolResult.toolCallId,
            content: toolResult.ok
              ? toolResult.content
              : `Tool error: ${toolResult.error ?? "unknown error"}`,
          });
        }

        continue;
      }

      if (decision.action === "ASK_USER") {
        appendMessage(state, { role: "assistant", content: decision.message });
        activeMetrics.increment("loop_awaiting_user_total", 1, {
          agentId: state.agentId ?? "unknown",
        });
        activeLogger.info(
          {
            agentId: state.agentId,
            sessionId: state.sessionId,
            step: state.step,
            reason: "awaiting_user",
          },
          "loop.awaiting_user",
        );
        return { state, reason: "awaiting_user" };
      }

      if (decision.action === "STOP") {
        appendMessage(state, { role: "assistant", content: decision.message });
        markDone(state, decision.message);
        activeMetrics.increment("loop_stopped_total", 1, {
          reason: "policy_stop",
        });
        activeLogger.info(
          {
            sessionId: state.sessionId,
            step: state.step,
            reason: "policy_stop",
          },
          "loop.stop",
        );
        return { state, reason: "policy_stop" };
      }

      appendMessage(state, { role: "assistant", content: decision.message });
      markDone(state, decision.message);
      activeMetrics.increment("loop_completed_total");
      activeLogger.info(
        { sessionId: state.sessionId, step: state.step, reason: "completed" },
        "loop.complete",
      );
      return { state, reason: "completed" };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown loop error";

    appendMessage(state, {
      role: "assistant",
      content: `Loop failed: ${errorMessage}`,
    });

    activeLogger.error(
      { sessionId: state.sessionId, step: state.step, error: errorMessage },
      "loop.error",
    );
    activeMetrics.increment("loop_errors_total");

    return { state, reason: "error" };
  }
}
