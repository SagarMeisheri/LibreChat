import { randomUUID } from 'crypto';
import { GraphEvents } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import { StepTypes, Tools } from 'librechat-data-provider';
import type { GenerateContentResponseUsageMetadata } from '@google/genai';
import type { SearchResultData } from 'librechat-data-provider';
import type { Event } from '@google/adk';

/** The tool's plain text: the wrapped `result` string when present, else its JSON. */
function toolOutputText(response: unknown): string {
  if (typeof response === 'string') return response;
  const result = (response as { result?: unknown } | undefined)?.result;
  return typeof result === 'string' ? result : JSON.stringify(response ?? {});
}

/** The client reads tool-call args as a JSON string, as the agents SDK emits them. */
function serializeArgs(args: unknown): string {
  if (typeof args === 'string') return args;
  return JSON.stringify(args ?? {});
}

export interface AdkStreamTranslatorOptions {
  runId: string;
  /** Search sources captured by the tool wrappers, keyed by tool call id. */
  searchResults?: Map<string, SearchResultData>;
  conversationId?: string;
  agentId?: string;
  modelName?: string;
  customHandlers?: Record<string, unknown>;
}

interface PendingToolStep {
  id: string;
  toolCallId: string;
  index: number;
  name: string;
  args: unknown;
  created_at: number;
}

export class AdkStreamTranslator {
  private runId: string;
  private conversationId?: string;
  private agentId: string;
  private modelName: string;
  private customHandlers?: Record<string, unknown>;

  private nextStepIndex = 0;

  private currentMessageStepId: string | null = null;
  private currentMessageStepIndex = 0;
  private messageDeltaCount = 0;

  private currentReasoningStepId: string | null = null;
  private currentReasoningStepIndex = 0;
  private reasoningDeltaCount = 0;

  private pendingToolSteps = new Map<string, PendingToolStep>();
  private searchResults?: Map<string, SearchResultData>;

  constructor(options: AdkStreamTranslatorOptions) {
    this.runId = options.runId;
    this.searchResults = options.searchResults;
    this.conversationId = options.conversationId;
    this.agentId = options.agentId || 'primary_agent';
    this.modelName = options.modelName || 'gemini';
    this.customHandlers = options.customHandlers;
  }

  private getMetadata(): Record<string, unknown> {
    return {
      run_id: this.runId,
      thread_id: this.conversationId,
      agent_id: this.agentId,
      ls_model_name: this.modelName,
      __invoked_model: this.modelName,
      __invoked_provider: 'google',
      last_agent_id: this.agentId,
      langgraph_node: `agent_${this.agentId}`,
    };
  }

  private async dispatch(eventName: string, data: unknown, extraArg?: unknown): Promise<void> {
    if (!this.customHandlers) return;
    const handler = this.customHandlers[eventName];
    if (!handler) return;
    const metadata = this.getMetadata();
    try {
      if (
        typeof handler === 'object' &&
        handler !== null &&
        'handle' in handler &&
        typeof (handler as { handle: unknown }).handle === 'function'
      ) {
        await (
          handler as {
            handle: (
              event: string,
              data: unknown,
              metadata: Record<string, unknown>,
              extraArg?: unknown,
            ) => Promise<unknown>;
          }
        ).handle(eventName, data, metadata, extraArg);
      } else if (typeof handler === 'function') {
        await (
          handler as (
            event: string,
            data: unknown,
            metadata: Record<string, unknown>,
            extraArg?: unknown,
          ) => Promise<unknown>
        )(eventName, data, metadata, extraArg);
      }
    } catch (err) {
      logger.error(`[ADK][Translator] Error dispatching ${eventName}:`, err);
    }
  }

  private async handleUsage(usage: GenerateContentResponseUsageMetadata): Promise<void> {
    const inputTokens = usage.promptTokenCount ?? 0;
    const outputTokens = usage.candidatesTokenCount ?? 0;
    const totalTokens = usage.totalTokenCount ?? inputTokens + outputTokens;

    const modelEndData = {
      output: {
        usage_metadata: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
        },
      },
    };

    const dummyGraph = {
      getAgentContext: () => ({
        clientOptions: { model: this.modelName },
        provider: 'google',
      }),
    };

    await this.dispatch(GraphEvents.CHAT_MODEL_END, modelEndData, dummyGraph);
  }

  private async handleReasoning(text: string, isPartial: boolean): Promise<void> {
    if (!this.currentReasoningStepId) {
      this.currentReasoningStepId = `step_${randomUUID()}`;
      this.currentReasoningStepIndex = this.nextStepIndex++;
      this.reasoningDeltaCount = 0;

      await this.dispatch(GraphEvents.ON_RUN_STEP, {
        runId: this.runId,
        agentId: this.agentId,
        id: this.currentReasoningStepId,
        type: StepTypes.MESSAGE_CREATION,
        index: this.currentReasoningStepIndex,
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: {
            message_id: this.runId,
            content_type: 'think',
          },
        },
        status: 'in_progress',
        created_at: Date.now(),
      });
    }

    if (isPartial || this.reasoningDeltaCount === 0) {
      this.reasoningDeltaCount++;
      await this.dispatch(GraphEvents.ON_REASONING_DELTA, {
        id: this.currentReasoningStepId,
        delta: {
          content: [{ type: 'think', think: text }],
        },
      });
    }
  }

  private async closeReasoningStep(): Promise<void> {
    if (!this.currentReasoningStepId) return;
    await this.dispatch(GraphEvents.ON_RUN_STEP_CLOSED, {
      id: this.currentReasoningStepId,
      index: this.currentReasoningStepIndex,
      type: StepTypes.MESSAGE_CREATION,
      status: 'completed',
      closed_at: Date.now(),
    });
    this.currentReasoningStepId = null;
  }

  private async handleText(text: string, isPartial: boolean): Promise<void> {
    if (this.currentReasoningStepId) {
      await this.closeReasoningStep();
    }

    if (!this.currentMessageStepId) {
      this.currentMessageStepId = `step_${randomUUID()}`;
      this.currentMessageStepIndex = this.nextStepIndex++;
      this.messageDeltaCount = 0;

      await this.dispatch(GraphEvents.ON_RUN_STEP, {
        runId: this.runId,
        agentId: this.agentId,
        id: this.currentMessageStepId,
        type: StepTypes.MESSAGE_CREATION,
        index: this.currentMessageStepIndex,
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: {
            message_id: this.runId,
            content_type: 'text',
          },
        },
        status: 'in_progress',
        created_at: Date.now(),
      });
    }

    if (isPartial || this.messageDeltaCount === 0) {
      this.messageDeltaCount++;
      await this.dispatch(GraphEvents.ON_MESSAGE_DELTA, {
        id: this.currentMessageStepId,
        delta: {
          content: [{ type: 'text', text }],
        },
      });
    }
  }

  private async closeMessageStep(): Promise<void> {
    if (!this.currentMessageStepId) return;
    await this.dispatch(GraphEvents.ON_RUN_STEP_CLOSED, {
      id: this.currentMessageStepId,
      index: this.currentMessageStepIndex,
      type: StepTypes.MESSAGE_CREATION,
      status: 'completed',
      closed_at: Date.now(),
    });
    this.currentMessageStepId = null;
    this.messageDeltaCount = 0;
  }

  private async handleFunctionCall(functionCall: {
    id?: string;
    name?: string;
    args?: unknown;
  }): Promise<void> {
    if (this.currentReasoningStepId) {
      await this.closeReasoningStep();
    }
    if (this.currentMessageStepId) {
      await this.closeMessageStep();
    }

    const toolStepId = `step_${randomUUID()}`;
    const toolCallId = functionCall.id || `call_${randomUUID()}`;
    const stepIndex = this.nextStepIndex++;
    const name = functionCall.name || 'tool';

    const pending: PendingToolStep = {
      id: toolStepId,
      toolCallId,
      index: stepIndex,
      name,
      args: functionCall.args,
      created_at: Date.now(),
    };

    if (functionCall.id) {
      this.pendingToolSteps.set(functionCall.id, pending);
    }
    this.pendingToolSteps.set(name, pending);

    await this.dispatch(GraphEvents.ON_RUN_STEP, {
      runId: this.runId,
      agentId: this.agentId,
      id: toolStepId,
      type: StepTypes.TOOL_CALLS,
      index: stepIndex,
      stepDetails: {
        type: StepTypes.TOOL_CALLS,
        tool_calls: [
          {
            id: toolCallId,
            type: 'tool_call',
            name,
            args: serializeArgs(functionCall.args),
          },
        ],
      },
      status: 'in_progress',
      created_at: pending.created_at,
    });
  }

  private async handleFunctionResponse(functionResponse: {
    id?: string;
    name?: string;
    response?: unknown;
  }): Promise<void> {
    const key = functionResponse.id || functionResponse.name;
    const step =
      (key ? this.pendingToolSteps.get(key) : undefined) ||
      (functionResponse.name ? this.pendingToolSteps.get(functionResponse.name) : undefined);

    if (step) {
      const outputText = toolOutputText(functionResponse.response);

      await this.dispatch(GraphEvents.ON_RUN_STEP_COMPLETED, {
        result: {
          id: step.id,
          index: step.index,
          type: 'tool_call',
          tool_call: {
            id: step.toolCallId,
            name: step.name,
            args: serializeArgs(step.args),
            output: outputText,
            progress: 1,
          },
          completed_at: Date.now(),
        },
      });

      const searchData = this.searchResults?.get(functionResponse.id ?? step.toolCallId);
      if (searchData?.organic?.length) {
        logger.info(
          `[ADK][Translator] Emitting web_search attachment for tool ${step.name} with ${searchData.organic.length} sources`,
        );
        /** The host's TOOL_END handler ignores events that arrive without a graph. */
        const graphStub = { toolCallStepIds: new Map([[step.toolCallId, step.id]]) };
        await this.dispatch(
          GraphEvents.TOOL_END,
          {
            output: {
              name: step.name,
              tool_call_id: step.toolCallId,
              artifact: {
                [Tools.web_search]: searchData,
              },
            },
          },
          graphStub,
        );
      }

      await this.dispatch(GraphEvents.ON_RUN_STEP_CLOSED, {
        id: step.id,
        index: step.index,
        type: StepTypes.TOOL_CALLS,
        status: 'completed',
        created_at: step.created_at,
        closed_at: Date.now(),
      });

      if (functionResponse.id) {
        this.pendingToolSteps.delete(functionResponse.id);
      }
      if (functionResponse.name) {
        this.pendingToolSteps.delete(functionResponse.name);
      }
    }
  }

  public async handleEvent(event: Event): Promise<void> {
    if (event.errorCode) {
      logger.error(`[ADK][Translator] Model error ${event.errorCode}: ${event.errorMessage ?? ''}`);
      throw new Error(`The model request failed (${event.errorCode}).`);
    }

    if (event.usageMetadata) {
      await this.handleUsage(event.usageMetadata);
    }

    const parts = event.content?.parts ?? [];
    for (const part of parts) {
      if (part.functionCall) {
        await this.handleFunctionCall(part.functionCall);
      } else if (part.functionResponse) {
        await this.handleFunctionResponse(part.functionResponse);
      } else if (typeof part.text === 'string') {
        if (part.thought === true) {
          await this.handleReasoning(part.text, event.partial === true);
        } else {
          await this.handleText(part.text, event.partial === true);
        }
      }
    }
  }

  public async finalize(): Promise<void> {
    if (this.currentReasoningStepId) {
      await this.closeReasoningStep();
    }
    if (this.currentMessageStepId) {
      await this.closeMessageStep();
    }

    for (const step of this.pendingToolSteps.values()) {
      await this.dispatch(GraphEvents.ON_RUN_STEP_CLOSED, {
        id: step.id,
        index: step.index,
        type: StepTypes.TOOL_CALLS,
        status: 'completed',
        created_at: step.created_at,
        closed_at: Date.now(),
      });
    }
    this.pendingToolSteps.clear();
  }

  public async handleAbort(): Promise<void> {
    if (this.currentReasoningStepId) {
      await this.dispatch(GraphEvents.ON_RUN_STEP_CLOSED, {
        id: this.currentReasoningStepId,
        index: this.currentReasoningStepIndex,
        type: StepTypes.MESSAGE_CREATION,
        status: 'cancelled',
        closed_at: Date.now(),
      });
      this.currentReasoningStepId = null;
    }
    if (this.currentMessageStepId) {
      await this.dispatch(GraphEvents.ON_RUN_STEP_CLOSED, {
        id: this.currentMessageStepId,
        index: this.currentMessageStepIndex,
        type: StepTypes.MESSAGE_CREATION,
        status: 'cancelled',
        closed_at: Date.now(),
      });
      this.currentMessageStepId = null;
    }

    for (const step of this.pendingToolSteps.values()) {
      await this.dispatch(GraphEvents.ON_RUN_STEP_CLOSED, {
        id: step.id,
        index: step.index,
        type: StepTypes.TOOL_CALLS,
        status: 'cancelled',
        created_at: step.created_at,
        closed_at: Date.now(),
      });
    }
    this.pendingToolSteps.clear();
  }
}
