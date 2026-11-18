import { BaseLlm } from '@google/adk';
import { logger } from '@librechat/data-schemas';
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk';
import type { GenerateContentResponseUsageMetadata } from '@google/genai';

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: OpenAiToolCall[];
}

interface StreamToolCallAccumulator {
  index: number;
  id: string;
  name: string;
  argumentsBuffer: string;
}

export class SarvamTokenFactoryLlm extends BaseLlm {
  static readonly supportedModels: Array<string | RegExp> = [
    /^deepseekv4(\.\d+)?-flash(-1017)?$/i,
    /^deepseekv4(-pro)?$/i,
    /^sarvam-105b.*/i,
    /^glm5\..*/i,
    /^gemma4$/i,
  ];

  private apiKey: string;
  private baseURL: string;

  constructor({ model }: { model: string }) {
    super({ model });
    this.apiKey = process.env.SARVAM_API_KEY || '';
    this.baseURL = process.env.SARVAM_BASE_URL || 'https://api.sarvam.ai/v2';
  }

  private convertContentsToMessages(llmRequest: LlmRequest): OpenAiMessage[] {
    const messages: OpenAiMessage[] = [];

    if (llmRequest.config?.systemInstruction) {
      const sysInst = llmRequest.config.systemInstruction;
      let text = '';
      if (typeof sysInst === 'string') {
        text = sysInst;
      } else if (Array.isArray(sysInst)) {
        text = sysInst
          .map((item) => (typeof item === 'string' ? item : (item as { text?: string }).text || ''))
          .filter(Boolean)
          .join('\n');
      } else if (typeof sysInst === 'object' && sysInst !== null && 'parts' in sysInst) {
        const parts = (sysInst as { parts?: Array<{ text?: string }> }).parts || [];
        text = parts
          .map((p) => p.text || '')
          .filter(Boolean)
          .join('\n');
      }
      if (text) {
        messages.push({ role: 'system', content: text });
      }
    }

    for (const content of llmRequest.contents || []) {
      const parts = content.parts || [];

      if (content.role === 'system') {
        const text = parts
          .map((p) => ('text' in p && typeof p.text === 'string' ? p.text : ''))
          .filter(Boolean)
          .join('\n');
        if (text) {
          messages.push({ role: 'system', content: text });
        }
        continue;
      }

      if (content.role === 'model') {
        const text = parts
          .filter(
            (p) => 'text' in p && typeof p.text === 'string' && !('thought' in p && p.thought),
          )
          .map((p) => (p as { text: string }).text)
          .filter(Boolean)
          .join('\n');

        const toolCalls: OpenAiToolCall[] = parts
          .filter((p) => 'functionCall' in p && p.functionCall != null)
          .map((p, idx) => {
            const fc = (p as { functionCall: { id?: string; name: string; args?: unknown } })
              .functionCall;
            return {
              id: fc.id || `call_${idx}_${Date.now()}`,
              type: 'function',
              function: {
                name: fc.name,
                arguments: typeof fc.args === 'string' ? fc.args : JSON.stringify(fc.args ?? {}),
              },
            };
          });

        messages.push({
          role: 'assistant',
          content: text || (toolCalls.length === 0 ? '' : null),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        });
        continue;
      }

      // content.role === 'user'
      const fnResponses = parts.filter(
        (p) => 'functionResponse' in p && p.functionResponse != null,
      );
      for (const p of fnResponses) {
        const fr = (p as { functionResponse: { id?: string; name?: string; response?: unknown } })
          .functionResponse;
        const respContent =
          typeof fr.response === 'string' ? fr.response : JSON.stringify(fr.response ?? {});
        messages.push({
          role: 'tool',
          tool_call_id: fr.id || fr.name || 'call_0',
          content: respContent,
        });
      }

      const text = parts
        .filter((p) => 'text' in p && typeof p.text === 'string')
        .map((p) => (p as { text: string }).text)
        .filter(Boolean)
        .join('\n');

      if (text) {
        messages.push({
          role: 'user',
          content: text,
        });
      }
    }

    return messages;
  }

  private convertTools(llmRequest: LlmRequest): Array<{
    type: 'function';
    function: { name: string; description?: string; parameters?: Record<string, unknown> };
  }> {
    const tools: Array<{
      type: 'function';
      function: { name: string; description?: string; parameters?: Record<string, unknown> };
    }> = [];

    if (!llmRequest.toolsDict) {
      return tools;
    }

    for (const [name, tool] of Object.entries(llmRequest.toolsDict)) {
      const anyTool = tool as unknown as {
        name?: string;
        description?: string;
        _getDeclaration?: () =>
          | { name?: string; description?: string; parameters?: Record<string, unknown> }
          | undefined;
      };

      if (typeof anyTool._getDeclaration === 'function') {
        const decl = anyTool._getDeclaration();
        if (decl) {
          tools.push({
            type: 'function',
            function: {
              name: decl.name || name,
              description: decl.description,
              parameters: decl.parameters,
            },
          });
          continue;
        }
      }

      tools.push({
        type: 'function',
        function: {
          name: anyTool.name || name,
          description: anyTool.description,
        },
      });
    }

    return tools;
  }

  async *generateContentAsync(
    llmRequest: LlmRequest,
    stream = true,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<LlmResponse, void> {
    if (!this.apiKey) {
      throw new Error('[Sarvam ADK] Missing SARVAM_API_KEY environment variable.');
    }

    this.maybeAppendUserContent(llmRequest);

    const messages = this.convertContentsToMessages(llmRequest);
    const tools = this.convertTools(llmRequest);

    const payload: Record<string, unknown> = {
      model: this.model,
      messages,
      stream,
    };

    if (tools.length > 0) {
      payload.tools = tools;
    }

    logger.info(
      `[Sarvam ADK] Sending request to ${this.baseURL}/chat/completions (model: ${this.model}, stream: ${stream})`,
    );

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'api-subscription-key': this.apiKey,
        ...this.trackingHeaders,
      },
      body: JSON.stringify(payload),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[Sarvam ADK] Request failed with status ${response.status}: ${errorText}`);
      throw new Error(`[Sarvam ADK] HTTP ${response.status}: ${errorText}`);
    }

    if (!stream || !response.body) {
      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: OpenAiToolCall[];
          };
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      const choice = data.choices?.[0];
      const message = choice?.message;
      const parts: Array<Record<string, unknown>> = [];

      if (message?.reasoning_content) {
        parts.push({ text: message.reasoning_content, thought: true });
      }
      if (message?.content) {
        parts.push({ text: message.content });
      }
      if (Array.isArray(message?.tool_calls)) {
        for (const tc of message.tool_calls) {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
          } catch {
            parsedArgs = {};
          }
          parts.push({
            functionCall: {
              id: tc.id,
              name: tc.function?.name || '',
              args: parsedArgs,
            },
          });
        }
      }

      yield {
        content: {
          role: 'model',
          parts,
        },
        usageMetadata: data.usage
          ? {
              promptTokenCount: data.usage.prompt_tokens,
              candidatesTokenCount: data.usage.completion_tokens,
              totalTokenCount: data.usage.total_tokens,
            }
          : undefined,
        turnComplete: true,
      };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const toolCallsMap = new Map<number, StreamToolCallAccumulator>();
    let lastUsage: GenerateContentResponseUsageMetadata | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === '[DONE]') break;

          let chunk: {
            choices?: Array<{
              delta?: {
                content?: string | null;
                reasoning_content?: string | null;
                tool_calls?: Array<{
                  index: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
            usage?: {
              prompt_tokens?: number;
              completion_tokens?: number;
              total_tokens?: number;
            };
          };

          try {
            chunk = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (chunk.usage) {
            lastUsage = {
              promptTokenCount: chunk.usage.prompt_tokens,
              candidatesTokenCount: chunk.usage.completion_tokens,
              totalTokenCount: chunk.usage.total_tokens,
            };
          }

          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          // Handle DeepSeek reasoning content (<think> blocks)
          if (delta.reasoning_content) {
            yield {
              content: {
                role: 'model',
                parts: [{ text: delta.reasoning_content, thought: true }],
              },
              partial: true,
            };
          }

          // Handle regular text content
          if (delta.content) {
            yield {
              content: {
                role: 'model',
                parts: [{ text: delta.content }],
              },
              partial: true,
            };
          }

          // Accumulate tool calls across chunks
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallsMap.has(idx)) {
                toolCallsMap.set(idx, {
                  index: idx,
                  id: tc.id || `call_${idx}_${Date.now()}`,
                  name: tc.function?.name || '',
                  argumentsBuffer: '',
                });
              }
              const current = toolCallsMap.get(idx)!;
              if (tc.id) current.id = tc.id;
              if (tc.function?.name) current.name = tc.function.name;
              if (tc.function?.arguments) current.argumentsBuffer += tc.function.arguments;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Emit completed function calls if any were accumulated
    if (toolCallsMap.size > 0) {
      const functionParts: Array<Record<string, unknown>> = [];
      for (const tc of toolCallsMap.values()) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = tc.argumentsBuffer ? JSON.parse(tc.argumentsBuffer) : {};
        } catch (err) {
          logger.warn(`[Sarvam ADK] Failed to parse arguments for tool ${tc.name}:`, err);
        }
        functionParts.push({
          functionCall: {
            id: tc.id,
            name: tc.name,
            args: parsedArgs,
          },
        });
      }

      yield {
        content: {
          role: 'model',
          parts: functionParts,
        },
        usageMetadata: lastUsage,
        turnComplete: true,
      };
      return;
    }

    if (lastUsage) {
      yield {
        usageMetadata: lastUsage,
        turnComplete: true,
      };
    } else {
      yield {
        turnComplete: true,
      };
    }
  }

  async connect(): Promise<BaseLlmConnection> {
    throw new Error('[Sarvam ADK] Bidirectional live connection is not supported.');
  }
}
