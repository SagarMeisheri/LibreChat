import { FunctionTool } from '@google/adk';
import { GraphEvents } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import type { LCTool, ToolExecuteResult } from '@librechat/agents';
import type { SearchResultData } from 'librechat-data-provider';
import type { Schema } from '@google/genai';
import type { Context } from '@google/adk';

export interface ConvertibleTool {
  name: string;
  description?: string;
  schema?: unknown;
  parameters?: unknown;
  invoke?: (input: Record<string, unknown>, config?: Record<string, unknown>) => Promise<unknown>;
  call?: (args: Record<string, unknown>) => Promise<unknown>;
  func?: (args: Record<string, unknown>) => Promise<unknown>;
  _call?: (args: Record<string, unknown>) => Promise<unknown>;
}

/** Per-run state shared by the tool wrappers and the stream translator. */
export interface AdkToolRunState {
  /** Next citation turn; each tool call takes one so anchors stay unique within a run. */
  nextTurn: number;
  /** Search sources captured per tool call id, emitted as `web_search` attachments. */
  searchResults: Map<string, SearchResultData>;
  /** Citation number per source URL, unique across every search in the run. */
  sourceNumbers: Map<string, number>;
}

export function createAdkToolRunState(): AdkToolRunState {
  return { nextTurn: 0, searchResults: new Map(), sourceNumbers: new Map() };
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'string' ? part : ((part as { text?: string } | null)?.text ?? ''),
      )
      .filter(Boolean)
      .join('\n');
  }
  return content == null ? '' : JSON.stringify(content);
}

/** Splits a LangChain `ToolMessage` or `[content, artifact]` tuple into text and artifact. */
function splitToolResult(result: unknown): { text: string; artifact?: Record<string, unknown> } {
  if (Array.isArray(result) && result.length === 2 && typeof result[1] === 'object') {
    return { text: contentToText(result[0]), artifact: result[1] as Record<string, unknown> };
  }
  if (typeof result === 'object' && result !== null && 'content' in result) {
    const message = result as { content: unknown; artifact?: unknown };
    return {
      text: contentToText(message.content),
      artifact:
        typeof message.artifact === 'object' && message.artifact !== null
          ? (message.artifact as Record<string, unknown>)
          : undefined,
    };
  }
  return { text: contentToText(result) };
}

/** Appends the anchors the client resolves, for tools whose text lacks them. */
function withAnchors(text: string, data: SearchResultData, turn: number): string {
  if (text.includes('ue202turn')) return text;
  const lines = (data.organic ?? []).map(
    (source, i) => `- ${source.title} (${source.link}) Anchor: \\ue202turn${turn}search${i}`,
  );
  return `${text}\n\nCite these sources using their anchors:\n${lines.join('\n')}`.trim();
}

/**
 * Sanitizes JSON Schema for Google Gemini Function Declarations.
 * Dereferences local $defs / $ref, strips unsupported draft-2020 keywords
 * like patternProperties, discriminator, examples, and normalizes const to enum.
 */
export function sanitizeSchemaForGemini(
  schema: unknown,
  defs?: Record<string, unknown>,
): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object' };
  }

  const schemaRecord = schema as Record<string, unknown>;
  const allDefs =
    defs ||
    (schemaRecord.$defs as Record<string, unknown> | undefined) ||
    (schemaRecord.definitions as Record<string, unknown> | undefined) ||
    {};

  if (typeof schemaRecord.$ref === 'string') {
    const match = schemaRecord.$ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/);
    if (match && allDefs[match[1]]) {
      return sanitizeSchemaForGemini(allDefs[match[1]], allDefs);
    }
    return { type: 'object' };
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schemaRecord)) {
    if (
      key === '$defs' ||
      key === 'definitions' ||
      key === '$schema' ||
      key === 'patternProperties' ||
      key === 'discriminator' ||
      key === 'examples' ||
      key === 'title' ||
      /** Object-size limits make Sarvam's backend answer 503 "model overloaded". */
      key === 'minProperties' ||
      key === 'maxProperties' ||
      key === 'additionalProperties'
    ) {
      continue;
    }

    if (key === 'const') {
      result.type = 'string';
      result.enum = [String(value)];
      continue;
    }

    if (key === 'required' && Array.isArray(value)) {
      result.required = value.filter((v): v is string => typeof v === 'string');
      continue;
    }

    if (key === 'enum' && Array.isArray(value)) {
      result.enum = value.map(String);
      continue;
    }

    if (key === 'properties' && value && typeof value === 'object') {
      const sanitizedProps: Record<string, unknown> = {};
      for (const [propName, propVal] of Object.entries(value as Record<string, unknown>)) {
        sanitizedProps[propName] = sanitizeSchemaForGemini(propVal, allDefs);
      }
      result.properties = sanitizedProps;
      continue;
    }

    if (key === 'items' && value && typeof value === 'object') {
      result.items = sanitizeSchemaForGemini(value, allDefs);
      continue;
    }

    if (key === 'anyOf' || key === 'oneOf') {
      if (Array.isArray(value)) {
        const filtered = value
          .filter(
            (v): v is Record<string, unknown> =>
              typeof v === 'object' && v !== null && (v as { type?: unknown }).type !== 'null',
          )
          .map((v) => sanitizeSchemaForGemini(v, allDefs));
        if (filtered.length === 1) {
          Object.assign(result, filtered[0]);
        } else if (filtered.length > 1) {
          result.anyOf = filtered;
        }
      }
      continue;
    }

    if (typeof value !== 'object' || value === null) {
      result[key] = value;
    }
  }

  if (schemaRecord.patternProperties && !result.properties) {
    result.type = 'object';
  }

  if (!result.type && !result.anyOf) {
    if (result.properties) {
      result.type = 'object';
    }
  }

  return result;
}

/**
 * Gives each source its run-wide citation number. A URL cited by two searches keeps one number.
 */
function numberSources(data: SearchResultData, state: AdkToolRunState): SearchResultData {
  return {
    ...data,
    organic: data.organic?.map((source) => {
      const known = state.sourceNumbers.get(source.link);
      const number = known ?? state.sourceNumbers.size + 1;
      state.sourceNumbers.set(source.link, number);
      return { ...source, citationNumber: number };
    }),
  };
}

/** Records search sources for the UI and returns the text the model sees, with anchors. */
function captureResult(
  result: unknown,
  callId: string,
  turn: number,
  state?: AdkToolRunState,
): unknown {
  if (state && result != null) {
    const { text, artifact } = splitToolResult(result);
    const fromArtifact = artifact?.web_search as SearchResultData | undefined;
    const data = fromArtifact ?? extractSearchResultData(text, turn);
    if (data?.organic?.length) {
      const searchData = numberSources({ ...data, turn: fromArtifact?.turn ?? turn }, state);
      state.searchResults.set(callId, searchData);
      return { result: withAnchors(text, searchData, searchData.turn ?? turn) };
    }
    return { result: text || JSON.stringify({ success: true }) };
  }
  return typeof result === 'string' ? { result } : (result ?? { success: true });
}

/** Where schema-only `toolDefinitions` are executed: the host's `ON_TOOL_EXECUTE` handler. */
export interface AdkToolExecution {
  handler: unknown;
  agentId: string;
  runId: string;
  userId?: string;
  conversationId?: string;
  signal?: AbortSignal;
}

function dispatchToolExecute(
  exec: AdkToolExecution,
  call: { id: string; name: string; args: Record<string, unknown>; turn: number },
): Promise<ToolExecuteResult> {
  const handle = (exec.handler as { handle?: (...a: unknown[]) => Promise<unknown> } | null)
    ?.handle;
  if (typeof handle !== 'function') {
    return Promise.reject(new Error('No ON_TOOL_EXECUTE handler is registered for this run.'));
  }
  return new Promise<ToolExecuteResult>((resolve, reject) => {
    const request = {
      toolCalls: [call],
      agentId: exec.agentId,
      userId: exec.userId,
      signal: exec.signal,
      configurable: {
        user_id: exec.userId,
        run_id: exec.runId,
        thread_id: exec.conversationId,
      },
      metadata: {
        run_id: exec.runId,
        thread_id: exec.conversationId,
        agent_id: exec.agentId,
      },
      resolve: (results: ToolExecuteResult[]) => {
        const match = results.find((r) => r.toolCallId === call.id) ?? results[0];
        if (match) {
          resolve(match);
          return;
        }
        reject(new Error(`No result returned for tool ${call.name}.`));
      },
      reject,
    };
    handle.call(exec.handler, GraphEvents.ON_TOOL_EXECUTE, request).catch(reject);
  });
}

/**
 * Converts schema-only tool definitions (how LibreChat agents carry their tools) into ADK
 * FunctionTools that run through the host's tool-execute handler, so loading, auth, artifacts
 * and attachments behave as they do on the LangGraph path.
 */
export function convertToolDefinitionsToAdk(
  definitions: LCTool[] | undefined,
  exec: AdkToolExecution,
  state?: AdkToolRunState,
  skipNames: ReadonlySet<string> = new Set(),
): FunctionTool<Schema>[] {
  const tools: FunctionTool<Schema>[] = [];
  for (const def of definitions ?? []) {
    if (!def.name || skipNames.has(def.name) || def.defer_loading === true) continue;
    if (def.allowed_callers && !def.allowed_callers.includes('direct')) continue;
    const name = def.name.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64);
    tools.push(
      new FunctionTool<Schema>({
        name,
        description: def.description || `Tool ${name}`,
        parameters: sanitizeSchemaForGemini(
          def.parameters ?? { type: 'object', properties: {} },
        ) as Schema,
        execute: async (args: unknown, toolContext?: Context) => {
          logger.info(`[ADK][Tool] Executing ${def.name} via ON_TOOL_EXECUTE`);
          const callId = toolContext?.functionCallId ?? `call_${name}_${state?.nextTurn ?? 0}`;
          const turn = state ? state.nextTurn++ : 0;
          try {
            const result = await dispatchToolExecute(exec, {
              id: callId,
              name: def.name,
              args:
                typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {},
              turn,
            });
            if (result.status === 'error') {
              return { error: result.errorMessage ?? 'Tool execution failed.' };
            }
            return captureResult([result.content, result.artifact], callId, turn, state);
          } catch (err: unknown) {
            logger.error(`[ADK][Tool] Error executing ${def.name}:`, err);
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      }),
    );
  }
  return tools;
}

/**
 * Converts a LibreChat or MCP tool instance into a Google ADK FunctionTool.
 * Sanitizes tool names to comply with Gemini's ^[a-zA-Z0-9_]{1,64}$ requirement.
 */
export function convertToolToAdk(
  tool: ConvertibleTool,
  state?: AdkToolRunState,
): FunctionTool<Schema> {
  const rawName = tool.name || 'tool';
  const sanitizedName = rawName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64);
  const description = tool.description || `Tool ${sanitizedName}`;
  const rawParameters = tool.schema ?? tool.parameters ?? { type: 'object', properties: {} };
  const parameters = sanitizeSchemaForGemini(rawParameters) as Schema;

  return new FunctionTool<Schema>({
    name: sanitizedName,
    description,
    parameters,
    execute: async (args: unknown, toolContext?: Context) => {
      logger.info(`[ADK][Tool] Executing ${rawName} (${sanitizedName})`, { args });
      try {
        const toolArgs =
          typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
        const callId = toolContext?.functionCallId ?? `call_${sanitizedName}`;
        const turn = state ? state.nextTurn++ : 0;
        let result: unknown;
        if (typeof tool.invoke === 'function') {
          /** ToolCall shape returns the artifact and lets the SDK search tool read its turn. */
          result = await tool.invoke(
            { id: callId, name: rawName, args: toolArgs, type: 'tool_call' },
            { toolCall: { id: callId, name: rawName, args: toolArgs, turn } },
          );
        } else if (typeof tool.call === 'function') {
          result = await tool.call(toolArgs);
        } else if (typeof tool.func === 'function') {
          result = await tool.func(toolArgs);
        } else if (typeof tool._call === 'function') {
          result = await tool._call(toolArgs);
        } else {
          throw new Error(`Tool ${rawName} has no callable execution method.`);
        }
        return captureResult(result, callId, turn, state);
      } catch (err: unknown) {
        logger.error(`[ADK][Tool] Error executing ${rawName}:`, err);
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    },
  });
}

/**
 * Converts a list of tools and/or a toolRegistry into an array of ADK FunctionTools.
 */
export function convertToolsToAdk(
  toolsList?: Array<ConvertibleTool | string>,
  toolRegistry?: Map<string, unknown>,
  state?: AdkToolRunState,
): FunctionTool<Schema>[] {
  const adkTools: FunctionTool<Schema>[] = [];
  const processedNames = new Set<string>();

  if (Array.isArray(toolsList)) {
    for (const t of toolsList) {
      if (typeof t === 'object' && t !== null && typeof t.name === 'string') {
        adkTools.push(convertToolToAdk(t, state));
        processedNames.add(t.name);
      } else if (typeof t === 'string' && toolRegistry?.has(t)) {
        const registered = toolRegistry.get(t) as ConvertibleTool;
        if (registered && !processedNames.has(t)) {
          adkTools.push(convertToolToAdk(registered, state));
          processedNames.add(t);
        }
      }
    }
  }

  if (toolRegistry) {
    for (const [name, registered] of toolRegistry.entries()) {
      if (!processedNames.has(name) && registered && typeof registered === 'object') {
        const candidate = registered as ConvertibleTool;
        if (
          typeof candidate.invoke === 'function' ||
          typeof candidate.call === 'function' ||
          typeof candidate.func === 'function' ||
          typeof candidate._call === 'function'
        ) {
          adkTools.push(convertToolToAdk(candidate, state));
          processedNames.add(name);
        }
      }
    }
  }

  return adkTools;
}

/** The array of result objects in a tool payload: `results`, `items`, or the payload itself. */
function pickCandidateList(record: Record<string, unknown>, data: unknown): unknown[] | null {
  if (Array.isArray(record.results)) return record.results;
  if (Array.isArray(record.items)) return record.items;
  return Array.isArray(data) ? data : null;
}

/**
 * Extracts structured SearchResultData from tool outputs (such as MCP search tools or web_search).
 */
export function extractSearchResultData(rawResponse: unknown, turn = 0): SearchResultData | null {
  if (!rawResponse) return null;

  let data: unknown = rawResponse;
  if (typeof data === 'object' && data !== null && 'result' in data) {
    data = (data as { result: unknown }).result;
  }

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return null;
    }
    try {
      data = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  if (
    Array.isArray(data) &&
    data.length === 2 &&
    typeof data[0] === 'string' &&
    typeof data[1] === 'object' &&
    data[1] !== null
  ) {
    const artifacts = data[1] as Record<string, unknown>;
    if (artifacts.web_search && typeof artifacts.web_search === 'object') {
      return artifacts.web_search as SearchResultData;
    }
    try {
      data = JSON.parse(data[0]);
    } catch {
      // not JSON
    }
  }

  if (typeof data !== 'object' || data === null) {
    return null;
  }

  const record = data as Record<string, unknown>;

  if (Array.isArray(record.organic) && record.organic.length > 0) {
    const organic = record.organic
      .map((item: unknown) => {
        if (!item || typeof item !== 'object') return null;
        const r = item as Record<string, unknown>;
        const link = (r.link || r.url || '') as string;
        if (!link || typeof link !== 'string') return null;
        return {
          title: (r.title || r.name || link) as string,
          link,
          snippet: (r.snippet || r.content || '') as string,
        };
      })
      .filter((item): item is { title: string; link: string; snippet: string } => item !== null);

    if (organic.length > 0) {
      return { turn, organic };
    }
  }

  const candidateList = pickCandidateList(record, data);

  if (candidateList && candidateList.length > 0) {
    const organic = candidateList
      .map((item: unknown) => {
        if (!item || typeof item !== 'object') return null;
        const r = item as Record<string, unknown>;
        const link = (r.url || r.link || r.href || '') as string;
        if (!link || typeof link !== 'string' || !link.startsWith('http')) return null;
        const title = (r.title || r.name || link) as string;
        let snippet = '';
        if (Array.isArray(r.excerpts)) {
          snippet = r.excerpts.join(' ');
        } else if (typeof r.snippet === 'string') {
          snippet = r.snippet;
        } else if (typeof r.content === 'string') {
          snippet = r.content;
        }
        return {
          title,
          link,
          snippet,
        };
      })
      .filter((item): item is { title: string; link: string; snippet: string } => item !== null);

    if (organic.length > 0) {
      return { turn, organic };
    }
  }

  return null;
}
