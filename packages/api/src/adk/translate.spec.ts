import type { Event } from '@google/adk';
import { AdkStreamTranslator } from './translate';

describe('AdkStreamTranslator model errors', () => {
  const translator = () => new AdkStreamTranslator({ runId: 'run_1', customHandlers: {} });

  it('raises on an error event without exposing the provider message', async () => {
    const event = { errorCode: '503', errorMessage: 'secret provider detail' } as unknown as Event;

    await expect(translator().handleEvent(event)).rejects.toThrow(
      'The model request failed (503).',
    );
    await expect(translator().handleEvent(event)).rejects.not.toThrow(/secret provider detail/);
  });

  it('ignores events without an error code', async () => {
    const event = { content: { parts: [] } } as unknown as Event;

    await expect(translator().handleEvent(event)).resolves.toBeUndefined();
  });
});

describe('AdkStreamTranslator tool events', () => {
  const collect = () => {
    const events: Array<{ name: string; data: Record<string, unknown>; graph?: unknown }> = [];
    const handlers = new Proxy(
      {},
      {
        get: (_t, name) =>
          typeof name === 'string'
            ? (_event: string, data: Record<string, unknown>, _meta?: unknown, graph?: unknown) => {
                events.push({ name, data, graph });
              }
            : undefined,
      },
    );
    const translator = new AdkStreamTranslator({
      runId: 'resp_1',
      agentId: 'agent_1',
      customHandlers: handlers as Record<string, unknown>,
      searchResults: new Map([
        ['call_1', { turn: 0, organic: [{ title: 'A', link: 'https://a.test', snippet: '' }] }],
      ]),
    });
    return { events, translator };
  };
  const call = {
    content: {
      parts: [{ functionCall: { id: 'call_1', name: 'web_search', args: { query: 'q' } } }],
    },
  } as unknown as Event;
  const response = {
    content: {
      parts: [
        {
          functionResponse: { id: 'call_1', name: 'web_search', response: { result: 'found it' } },
        },
      ],
    },
  } as unknown as Event;

  it('stamps runId and agentId and sends args as a JSON string, as the client requires', async () => {
    const { events, translator } = collect();

    await translator.handleEvent(call);

    const step = events.find((e) => e.name === 'on_run_step')?.data as {
      runId: string;
      agentId: string;
      stepDetails: { tool_calls: Array<{ name: string; args: string }> };
    };
    expect(step.runId).toBe('resp_1');
    expect(step.agentId).toBe('agent_1');
    expect(step.stepDetails.tool_calls[0]).toMatchObject({
      name: 'web_search',
      args: '{"query":"q"}',
    });
  });

  it('nests the tool output inside tool_call and emits the search attachment', async () => {
    const { events, translator } = collect();

    await translator.handleEvent(call);
    await translator.handleEvent(response);

    const done = events.find((e) => e.name === 'on_run_step_completed')?.data as {
      result: { tool_call: { output: string; progress: number }; index: number };
    };
    expect(done.result.tool_call).toMatchObject({ output: 'found it', progress: 1 });
    const end = events.find((e) => e.name === 'on_tool_end')?.data as {
      output: { artifact: { web_search: { organic: unknown[] } } };
    };
    expect(end.output.artifact.web_search.organic).toHaveLength(1);
  });

  it('hands the host TOOL_END handler a graph that maps the tool call to its step', async () => {
    const { events, translator } = collect();

    await translator.handleEvent(call);
    await translator.handleEvent(response);

    const end = events.find((e) => e.name === 'on_tool_end');
    const stepId = (
      events.find((e) => e.name === 'on_run_step_completed')?.data as {
        result: { id: string };
      }
    ).result.id;
    expect(
      (end?.graph as { toolCallStepIds: Map<string, string> }).toolCallStepIds.get('call_1'),
    ).toBe(stepId);
  });
});
