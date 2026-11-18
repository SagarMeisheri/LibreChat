import type { Context } from '@google/adk';
import type { ConvertibleTool } from './tools';
import {
  convertToolToAdk,
  createAdkToolRunState,
  sanitizeSchemaForGemini,
  convertToolDefinitionsToAdk,
} from './tools';

/** `@google/adk` pulls in ESM-only deps Jest does not transform; only the class shell is stubbed. */
jest.mock('@google/adk', () => ({
  FunctionTool: class {
    constructor(options: Record<string, unknown>) {
      Object.assign(this, options);
    }
  },
}));

type Executable = { execute: (args: unknown, ctx?: Context) => Promise<unknown> };

const run = (tool: ConvertibleTool, state = createAdkToolRunState(), callId = 'call_1') => {
  const adkTool = convertToolToAdk(tool, state) as unknown as Executable;
  const ctx = { functionCallId: callId } as Context;
  return { state, call: () => adkTool.execute({ query: 'q' }, ctx) };
};

describe('convertToolToAdk search citations', () => {
  it('invokes with the tool-call shape and keeps the SDK anchors and artifact', async () => {
    const invoke = jest.fn().mockResolvedValue({
      content: '# Search 0\nAnchor: \\ue202turn3search0',
      artifact: {
        web_search: { turn: 3, organic: [{ title: 'A', link: 'https://a.test', snippet: '' }] },
      },
    });
    const { state, call } = run({ name: 'web_search', invoke });

    const out = (await call()) as { result: string };

    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'call_1', type: 'tool_call', args: { query: 'q' } }),
      expect.objectContaining({ toolCall: expect.objectContaining({ turn: 0 }) }),
    );
    expect(out.result).toBe('# Search 0\nAnchor: \\ue202turn3search0');
    expect(state.searchResults.get('call_1')?.turn).toBe(3);
  });

  it('appends anchors for search results that carry none and records the turn', async () => {
    const payload = JSON.stringify({
      results: [{ title: 'T', url: 'https://t.test', content: 'c' }],
    });
    const { state, call } = run({ name: 'mcp_search', invoke: async () => payload });

    const out = (await call()) as { result: string };

    expect(out.result).toContain('Anchor: \\ue202turn0search0');
    expect(state.searchResults.get('call_1')?.organic).toHaveLength(1);
  });

  it('gives each call a distinct turn so anchors do not collide', async () => {
    const payload = JSON.stringify({ organic: [{ title: 'T', link: 'https://t.test' }] });
    const state = createAdkToolRunState();
    const tool: ConvertibleTool = { name: 'mcp_search', invoke: async () => payload };

    await run(tool, state, 'a').call();
    await run(tool, state, 'b').call();

    expect(state.searchResults.get('a')?.turn).toBe(0);
    expect(state.searchResults.get('b')?.turn).toBe(1);
  });

  it('numbers sources across searches and reuses a number for a repeated URL', async () => {
    const page = (...links: string[]) =>
      JSON.stringify({ organic: links.map((link) => ({ title: link, link })) });
    const state = createAdkToolRunState();

    await run(
      { name: 's', invoke: async () => page('https://a.test', 'https://b.test') },
      state,
      'a',
    ).call();
    await run(
      { name: 's', invoke: async () => page('https://b.test', 'https://c.test') },
      state,
      'b',
    ).call();

    const labels = (id: string) =>
      state.searchResults.get(id)?.organic?.map((s) => s.citationNumber);
    expect(labels('a')).toEqual([1, 2]);
    expect(labels('b')).toEqual([2, 3]);
  });

  it('leaves non-search output untouched and records no sources', async () => {
    const { state, call } = run({ name: 'calc', invoke: async () => 'plain answer' });

    expect(await call()).toEqual({ result: 'plain answer' });
    expect(state.searchResults.size).toBe(0);
  });

  it('returns tool failures as an error payload instead of throwing', async () => {
    const { call } = run({
      name: 'bad',
      invoke: async () => {
        throw new Error('boom');
      },
    });

    expect(await call()).toEqual({ error: 'boom' });
  });
});

describe('convertToolDefinitionsToAdk', () => {
  const exec = (results: unknown) => {
    const handle = jest.fn(async (_event: string, req: { resolve: (r: unknown) => void }) => {
      req.resolve(results);
    });
    return { handle, exec: { handler: { handle }, agentId: 'agent_1', runId: 'run_1' } };
  };
  const toExecutable = (tool: unknown) => tool as Executable;

  it('runs schema-only tools through the host handler and captures search sources', async () => {
    const { handle, exec: execution } = exec([
      {
        toolCallId: 'c1',
        status: 'success',
        content: '# Search 0\nAnchor: \\ue202turn0search0',
        artifact: { web_search: { turn: 0, organic: [{ title: 'A', link: 'https://a.test' }] } },
      },
    ]);
    const state = createAdkToolRunState();
    const [tool] = convertToolDefinitionsToAdk(
      [
        {
          name: 'web_search',
          description: 'search',
          parameters: { type: 'object', properties: {} },
        },
      ],
      execution,
      state,
    );

    const out = await toExecutable(tool).execute({ query: 'q' }, {
      functionCallId: 'c1',
    } as Context);

    expect(handle).toHaveBeenCalledWith(
      'on_tool_execute',
      expect.objectContaining({
        agentId: 'agent_1',
        toolCalls: [
          expect.objectContaining({ id: 'c1', name: 'web_search', args: { query: 'q' } }),
        ],
      }),
    );
    expect(out).toEqual({ result: '# Search 0\nAnchor: \\ue202turn0search0' });
    expect(state.searchResults.get('c1')?.organic).toHaveLength(1);
  });

  it('skips deferred tools and returns handler errors without throwing', async () => {
    const { exec: execution } = exec([
      { toolCallId: 'c2', status: 'error', content: '', errorMessage: 'denied' },
    ]);
    const tools = convertToolDefinitionsToAdk(
      [
        { name: 'later', defer_loading: true },
        { name: 'now', description: 'x' },
      ],
      execution,
    );

    expect(tools).toHaveLength(1);
    expect(await toExecutable(tools[0]).execute({}, { functionCallId: 'c2' } as Context)).toEqual({
      error: 'denied',
    });
  });
});

describe('sanitizeSchemaForGemini', () => {
  it('drops object-size limits that make Sarvam reject the request', () => {
    const out = sanitizeSchemaForGemini({
      type: 'object',
      properties: {
        questions: { type: 'object', minProperties: 1, maxProperties: 100, description: 'q' },
      },
    });

    expect(out).toEqual({
      type: 'object',
      properties: { questions: { type: 'object', description: 'q' } },
    });
  });
});
