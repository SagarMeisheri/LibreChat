import { randomUUID } from 'crypto';
import { logger } from '@librechat/data-schemas';
import { LlmAgent, InMemoryRunner, createEvent, StreamingMode } from '@google/adk';
import type { BaseMessage } from '@librechat/agents/langchain/messages';
import type { AppConfig, IUser } from '@librechat/data-schemas';
import type { GenericTool } from '@librechat/agents';
import { AdkStreamTranslator } from './translate';
import { convertToolsToAdk } from './tools';

export interface AdkRunAgent {
  id: string;
  name?: string | null;
  description?: string | null;
  instructions?: string | null;
  model?: string | null;
  model_parameters?: Record<string, unknown> | null;
  tools?: GenericTool[];
  toolRegistry?: Map<string, unknown>;
  [key: string]: unknown;
}

export interface CreateAdkRunOptions {
  agents: AdkRunAgent[];
  signal: AbortSignal;
  runId?: string;
  conversationId?: string;
  customHandlers?: Record<string, unknown>;
  appConfig?: AppConfig;
  user?: IUser;
  messages?: BaseMessage[];
  requestBody?: Record<string, unknown>;
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: unknown) => {
        if (typeof part === 'string') return part;
        if (
          part &&
          typeof part === 'object' &&
          'text' in part &&
          typeof (part as { text?: unknown }).text === 'string'
        ) {
          return (part as { text: string }).text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export interface AdkRunInstance {
  runId: string;
  Graph: null;
  graphRunnable: {
    getState: () => { values: Record<string, unknown> };
  };
  getInterrupt: () => undefined;
  generateActivityLabel: () => Promise<{ label: string }>;
  generateActivityPhaseLabel: () => Promise<{ label: string }>;
  generateTitle: () => Promise<{ title: string }>;
  resume: () => Promise<never>;
  processStream: (
    input: { messages?: BaseMessage[] },
    config?: unknown,
    options?: unknown,
  ) => Promise<void>;
}

export async function createAdkRun({
  agents,
  signal,
  runId,
  conversationId,
  customHandlers,
  appConfig,
  user,
  messages: initialMessages,
}: CreateAdkRunOptions): Promise<AdkRunInstance> {
  const primaryAgent = agents[0];
  if (!primaryAgent) {
    throw new Error('[ADK] No agent provided to createAdkRun');
  }

  const resolvedRunId = runId || `adk_run_${randomUUID()}`;
  let rawModel = 'gemini-2.5-flash';
  if (typeof primaryAgent.model_parameters?.model === 'string') {
    rawModel = primaryAgent.model_parameters.model;
  } else if (typeof primaryAgent.model === 'string') {
    rawModel = primaryAgent.model;
  }
  // Strip any 'google/' prefix if present
  const modelName = rawModel.replace(/^google\//, '');
  const agentName = primaryAgent.name
    ? primaryAgent.name.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64)
    : 'primary_agent';
  let instruction =
    primaryAgent.instructions || primaryAgent.description || 'You are a helpful assistant.';

  const adkTools = convertToolsToAdk(primaryAgent.tools, primaryAgent.toolRegistry);
  logger.info(`[ADK] Converted ${adkTools.length} tools for ADK agent`);

  const autoCitations = appConfig?.adk?.autoCitations ?? true;
  if (autoCitations && adkTools.length > 0) {
    const hasExistingCitationGuidance =
      instruction.includes('### Sources') || /cite|citations|references/i.test(instruction);
    if (!hasExistingCitationGuidance) {
      instruction +=
        '\n\nWhen using search results or external tools to answer questions:\n1. Cite your sources inline using markdown links (e.g. [Source Name](url)).\n2. Include a "### Sources" section at the end of your response with a bulleted list of all sources used.';
    }
  }

  logger.info(`[ADK] Initializing LlmAgent with model: ${modelName}, agentName: ${agentName}`);

  const llmAgent = new LlmAgent({
    name: agentName,
    model: modelName,
    instruction,
    tools: adkTools,
  });

  const runner = new InMemoryRunner({ agent: llmAgent });

  const processStream = async (
    input: { messages?: BaseMessage[] },
    _config?: unknown,
    _options?: unknown,
  ): Promise<void> => {
    logger.info(`[ADK] processStream called for runId: ${resolvedRunId}`);
    const effectiveMessages = input.messages ?? initialMessages ?? [];

    const translator = new AdkStreamTranslator({
      runId: resolvedRunId,
      conversationId,
      agentId: primaryAgent.id,
      modelName,
      customHandlers,
    });

    const session = await runner.sessionService.createSession({
      appName: runner.appName,
      userId: user?.id || 'default_user',
    });

    try {
      // Find history vs current message
      const historyMessages = effectiveMessages.slice(0, -1);
      const lastMessage = effectiveMessages[effectiveMessages.length - 1];

      for (let i = 0; i < historyMessages.length; i++) {
        const m = historyMessages[i] as unknown as Record<string, unknown>;
        const type =
          typeof m._getType === 'function'
            ? (m._getType as () => string)()
            : (m.type as string | undefined);
        const text = extractText(m.content);
        if (!text) continue;

        if (type === 'human') {
          await runner.sessionService.appendEvent({
            session,
            event: createEvent({
              invocationId: `inv_${i}`,
              author: 'user',
              content: { role: 'user', parts: [{ text }] },
              timestamp: Date.now() - (historyMessages.length - i) * 1000,
            }),
          });
        } else if (type === 'ai') {
          await runner.sessionService.appendEvent({
            session,
            event: createEvent({
              invocationId: `inv_${i}`,
              author: llmAgent.name,
              content: { role: 'model', parts: [{ text }] },
              timestamp: Date.now() - (historyMessages.length - i) * 1000,
            }),
          });
        }
      }

      const userText = extractText(lastMessage?.content) || 'Hello';
      const newMessage = {
        role: 'user',
        parts: [{ text: userText }],
      };

      logger.info(`[ADK] Running agent stream with user message: "${userText.slice(0, 100)}..."`);

      const stream = runner.runAsync({
        userId: user?.id || 'default_user',
        sessionId: session.id,
        newMessage,
        runConfig: {
          streamingMode: StreamingMode.SSE,
        },
        abortSignal: signal,
      });

      for await (const event of stream) {
        if (signal.aborted) {
          logger.info(`[ADK] Run aborted via signal for runId: ${resolvedRunId}`);
          await translator.handleAbort();
          break;
        }
        await translator.handleEvent(event);
      }

      if (!signal.aborted) {
        await translator.finalize();
        logger.info(`[ADK] Run finished successfully for runId: ${resolvedRunId}`);
      }
    } catch (err: unknown) {
      logger.error(`[ADK] Error executing run ${resolvedRunId}:`, err);
      await translator.handleAbort();
      throw err;
    } finally {
      try {
        await runner.sessionService.deleteSession({
          appName: runner.appName,
          userId: user?.id || 'default_user',
          sessionId: session.id,
        });
      } catch (cleanupErr) {
        logger.warn('[ADK] Failed cleaning up ephemeral session:', cleanupErr);
      }
    }
  };

  return {
    runId: resolvedRunId,
    Graph: null,
    graphRunnable: {
      getState: () => ({ values: {} }),
    },
    getInterrupt: () => undefined,
    generateActivityLabel: async () => ({ label: '' }),
    generateActivityPhaseLabel: async () => ({ label: '' }),
    generateTitle: async () => ({ title: '' }),
    resume: async () => {
      throw new Error('[ADK] Human-in-the-loop resume is not supported in ADK mode.');
    },
    processStream,
  };
}
