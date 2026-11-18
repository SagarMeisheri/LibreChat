import type { LlmRequest } from '@google/adk';
import { cleanTitle, generateAdkTitle } from './title';

const fakeLlm = (parts: Array<{ text: string; thought?: boolean }>) => {
  const requests: LlmRequest[] = [];
  return {
    requests,
    llm: {
      async *generateContentAsync(request: LlmRequest) {
        requests.push(request);
        yield { content: { role: 'model', parts } };
      },
    },
  };
};

describe('generateAdkTitle', () => {
  it('builds the prompt from the question and answer and cleans the reply', async () => {
    const { llm, requests } = fakeLlm([
      { text: 'thinking about it', thought: true },
      { text: '**"Real Madrid Latest News."**\nextra line' },
    ]);

    const out = await generateAdkTitle({
      llm,
      inputText: 'real madrid news',
      contentParts: [
        { type: 'text', text: 'Madrid won $& 3-1' },
        { type: 'think', think: 'x' },
      ],
    });

    expect(out).toEqual({ title: 'Real Madrid Latest News' });
    const prompt = requests[0].contents[0].parts?.[0].text ?? '';
    expect(prompt).toContain('User: real madrid news');
    expect(prompt).toContain('AI: Madrid won $& 3-1');
    expect(prompt).not.toContain('{convo}');
  });

  it('uses a custom prompt and appends the conversation when it has no placeholder', async () => {
    const { llm, requests } = fakeLlm([{ text: 'Title' }]);

    await generateAdkTitle({ llm, inputText: 'hi', titlePrompt: 'Name this chat.' });

    expect(requests[0].contents[0].parts?.[0].text).toBe('Name this chat.\n\nUser: hi');
  });
});

describe('cleanTitle', () => {
  it('strips a label, markdown and trailing punctuation, and caps the length', () => {
    expect(cleanTitle('Title: `Hello World`.')).toBe('Hello World');
    expect(cleanTitle('x'.repeat(200))).toHaveLength(80);
    expect(cleanTitle('')).toBe('');
  });
});
