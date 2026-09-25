import { getServerUrl } from './config';
import { getAuthToken } from './storage';

export interface StreamEvent {
  event?: string;
  data: any;
}

export interface StreamCallbacks {
  onDelta?: (delta: string) => void;
  onThinking?: (thought: string) => void;
  onToolCall?: (toolCall: { id: string; name: string; args?: any; status: string }) => void;
  onToolOutput?: (toolOutput: { id: string; output: string }) => void;
  onArtifact?: (artifact: { type: string; title: string; content: string }) => void;
  onComplete?: (finalData: { conversationId: string; messageId: string; text: string }) => void;
  onError?: (error: Error) => void;
}

export interface SendMessageParams {
  conversationId?: string;
  parentMessageId?: string;
  text: string;
  endpoint?: string;
  model?: string;
  agentId?: string;
}

export async function sendStreamingMessage(
  params: SendMessageParams,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const baseURL = await getServerUrl();
  const token = await getAuthToken();

  const endpoint = params.agentId ? '/api/agents/chat' : '/api/ask';
  const url = `${baseURL}${endpoint}`;

  const payload = {
    text: params.text,
    conversationId: params.conversationId,
    parentMessageId: params.parentMessageId,
    endpoint: params.endpoint || 'openAI',
    model: params.model,
    agent_id: params.agentId,
    generationProtocolVersion: 2,
    isCreatedByUser: true,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-LibreChat-Generation-Protocol': '2',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errMsg = `Request failed (${response.status})`;
      try {
        const parsed = JSON.parse(errorText);
        errMsg = parsed.message || errMsg;
      } catch {}
      throw new Error(errMsg);
    }

    if (!response.body) {
      throw new Error('Response body is null, cannot stream');
    }

    const reader = (response.body as any).getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulatedText = '';
    let accumulatedThinking = '';
    let activeConversationId = params.conversationId || '';
    let activeMessageId = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data: ')) {
          const rawData = trimmed.slice(6);
          if (rawData === '[DONE]') {
            callbacks.onComplete?.({
              conversationId: activeConversationId,
              messageId: activeMessageId,
              text: accumulatedText,
            });
            return;
          }

          try {
            const data = JSON.parse(rawData);

            // Handle text delta
            if (typeof data.text === 'string' && data.text.length > accumulatedText.length) {
              const delta = data.text.slice(accumulatedText.length);
              accumulatedText = data.text;
              callbacks.onDelta?.(delta);
            } else if (typeof data.delta === 'string') {
              accumulatedText += data.delta;
              callbacks.onDelta?.(data.delta);
            }

            // Handle reasoning / thinking
            if (typeof data.thought === 'string') {
              accumulatedThinking += data.thought;
              callbacks.onThinking?.(accumulatedThinking);
            }

            // Extract conversation and message identifiers
            if (data.conversationId) {
              activeConversationId = data.conversationId;
            }
            if (data.messageId) {
              activeMessageId = data.messageId;
            }

            // Handle Tool calls
            if (data.tool_calls || data.toolCall) {
              const tc = data.toolCall || data.tool_calls?.[0];
              if (tc) {
                callbacks.onToolCall?.({
                  id: tc.id || tc.toolCallId || 'tool-call',
                  name: tc.name || tc.function?.name || 'Tool',
                  args: tc.args || tc.function?.arguments,
                  status: 'running',
                });
              }
            }

            // Check for code artifact blocks in the accumulated text
            const artifactMatch = accumulatedText.match(/```(html|svg|mermaid|jsx|tsx)\n([\s\S]*?)```/);
            if (artifactMatch) {
              callbacks.onArtifact?.({
                type: artifactMatch[1],
                title: `${artifactMatch[1].toUpperCase()} Artifact`,
                content: artifactMatch[2],
              });
            }

            // Terminal done event
            if (data.final || data.done) {
              callbacks.onComplete?.({
                conversationId: activeConversationId,
                messageId: activeMessageId,
                text: accumulatedText,
              });
              return;
            }
          } catch {
            // Non-JSON chunk delta
            if (rawData.startsWith('0:')) {
              try {
                const textChunk = JSON.parse(rawData.slice(2));
                accumulatedText += textChunk;
                callbacks.onDelta?.(textChunk);
              } catch {}
            }
          }
        }
      }
    }

    callbacks.onComplete?.({
      conversationId: activeConversationId,
      messageId: activeMessageId,
      text: accumulatedText,
    });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      callbacks.onComplete?.({
        conversationId: params.conversationId || '',
        messageId: '',
        text: 'Generation stopped.',
      });
      return;
    }
    callbacks.onError?.(error);
  }
}
