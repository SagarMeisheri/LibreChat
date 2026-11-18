import type { BaseLlm, LlmRequest } from '@google/adk';

const DEFAULT_TITLE_PROMPT = `Provide a concise, 5-word-or-less title for the conversation, using title case conventions. Only return the title itself.

Conversation:
{convo}`;

const MAX_TITLE_LENGTH = 80;

export interface AdkTitleOptions {
  llm: Pick<BaseLlm, 'generateContentAsync'>;
  inputText: string;
  /** The finished response's content parts; only text parts are used. */
  contentParts?: unknown[];
  titlePrompt?: string;
  signal?: AbortSignal;
}

function responseText(parts: unknown[] | undefined): string {
  return (parts ?? [])
    .map((part) => {
      const { type, text } = (part ?? {}) as { type?: string; text?: unknown };
      return type === 'text' && typeof text === 'string' ? text : '';
    })
    .filter(Boolean)
    .join('\n');
}

/** Keeps the first line and drops quotes, markdown markers and a trailing period. */
export function cleanTitle(raw: string): string {
  const line = raw.split('\n').find((l) => l.trim().length > 0) ?? '';
  return line
    .replace(/^(title\s*:\s*)/i, '')
    .replace(/[*_`#"“”]/g, '')
    .replace(/[.\s]+$/, '')
    .trim()
    .slice(0, MAX_TITLE_LENGTH);
}

export async function generateAdkTitle({
  llm,
  inputText,
  contentParts,
  titlePrompt,
  signal,
}: AdkTitleOptions): Promise<{ title: string }> {
  const answer = responseText(contentParts);
  const convo = [`User: ${inputText}`, answer ? `AI: ${answer}` : ''].filter(Boolean).join('\n\n');
  const base = titlePrompt ?? DEFAULT_TITLE_PROMPT;
  const template = base.includes('{convo}') ? base : `${base}\n\n{convo}`;
  /** Replacer function: `$` sequences in the conversation must not be read as patterns. */
  const prompt = template.replace('{convo}', () => convo);

  const request: LlmRequest = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    toolsDict: {},
    liveConnectConfig: {},
  };

  let text = '';
  for await (const response of llm.generateContentAsync(request, false, signal)) {
    for (const part of response.content?.parts ?? []) {
      if (part.thought !== true && typeof part.text === 'string') {
        text += part.text;
      }
    }
  }
  return { title: cleanTitle(text) };
}
