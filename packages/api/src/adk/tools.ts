import { FunctionTool } from '@google/adk';
import { logger } from '@librechat/data-schemas';
import type { Schema } from '@google/genai';

export interface ConvertibleTool {
  name: string;
  description?: string;
  schema?: unknown;
  parameters?: unknown;
  invoke?: (args: Record<string, unknown>) => Promise<unknown>;
  call?: (args: Record<string, unknown>) => Promise<unknown>;
  func?: (args: Record<string, unknown>) => Promise<unknown>;
  _call?: (args: Record<string, unknown>) => Promise<unknown>;
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
 * Converts a LibreChat or MCP tool instance into a Google ADK FunctionTool.
 * Sanitizes tool names to comply with Gemini's ^[a-zA-Z0-9_]{1,64}$ requirement.
 */
export function convertToolToAdk(tool: ConvertibleTool): FunctionTool<Schema> {
  const rawName = tool.name || 'tool';
  const sanitizedName = rawName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64);
  const description = tool.description || `Tool ${sanitizedName}`;
  const rawParameters = tool.schema ?? tool.parameters ?? { type: 'object', properties: {} };
  const parameters = sanitizeSchemaForGemini(rawParameters) as Schema;

  return new FunctionTool<Schema>({
    name: sanitizedName,
    description,
    parameters,
    execute: async (args: unknown) => {
      logger.info(`[ADK][Tool] Executing ${rawName} (${sanitizedName})`, { args });
      try {
        const toolArgs =
          typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
        let result: unknown;
        if (typeof tool.invoke === 'function') {
          result = await tool.invoke(toolArgs);
        } else if (typeof tool.call === 'function') {
          result = await tool.call(toolArgs);
        } else if (typeof tool.func === 'function') {
          result = await tool.func(toolArgs);
        } else if (typeof tool._call === 'function') {
          result = await tool._call(toolArgs);
        } else {
          throw new Error(`Tool ${rawName} has no callable execution method.`);
        }
        return typeof result === 'string' ? { result } : (result ?? { success: true });
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
): FunctionTool<Schema>[] {
  const adkTools: FunctionTool<Schema>[] = [];
  const processedNames = new Set<string>();

  if (Array.isArray(toolsList)) {
    for (const t of toolsList) {
      if (typeof t === 'object' && t !== null && typeof t.name === 'string') {
        adkTools.push(convertToolToAdk(t));
        processedNames.add(t.name);
      } else if (typeof t === 'string' && toolRegistry?.has(t)) {
        const registered = toolRegistry.get(t) as ConvertibleTool;
        if (registered && !processedNames.has(t)) {
          adkTools.push(convertToolToAdk(registered));
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
          adkTools.push(convertToolToAdk(candidate));
          processedNames.add(name);
        }
      }
    }
  }

  return adkTools;
}
