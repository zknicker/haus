import * as z from 'zod';

/**
 * A Computer-hosted tool an Agent can call. Runtime drivers reach it over the host-tool MCP
 * server; the Zod schema validates input at that boundary and renders the advertised JSON Schema.
 */
export interface HostTool {
    readonly description: string;
    /** Parses with `inputSchema`, then runs. Throws `z.ZodError` for invalid input. */
    readonly execute: (input: unknown, options: HostToolCallOptions) => Promise<HostToolOutput>;
    readonly inputSchema: z.ZodType;
    readonly name: string;
}

export type HostToolSet = readonly HostTool[];

export interface HostToolCallOptions {
    readonly signal: AbortSignal;
    readonly toolCallId: string;
}

/** Plain text, or a JSON value the model reads as structured content. */
export type HostToolOutput =
    | { readonly type: 'json'; readonly value: unknown }
    | { readonly type: 'text'; readonly text: string };

export function defineHostTool<Schema extends z.ZodType>(definition: {
    description: string;
    execute: (input: z.output<Schema>, options: HostToolCallOptions) => Promise<HostToolOutput>;
    inputSchema: Schema;
    name: string;
}): HostTool {
    return {
        description: definition.description,
        execute: (input, options) =>
            definition.execute(definition.inputSchema.parse(input), options),
        inputSchema: definition.inputSchema,
        name: definition.name,
    };
}

/** One Zod 4 rendering (draft-7, inline) so every runtime sees the same schema. */
export function hostToolJsonSchema(tool: HostTool): Record<string, unknown> {
    const schema = z.toJSONSchema(tool.inputSchema, {
        io: 'input',
        reused: 'inline',
        target: 'draft-7',
    }) as Record<string, unknown>;
    return schema.type === 'object' && schema.additionalProperties === undefined
        ? { ...schema, additionalProperties: false }
        : schema;
}

export function hostToolsByName(tools: HostToolSet): ReadonlyMap<string, HostTool> {
    const byName = new Map<string, HostTool>();
    for (const tool of tools) {
        if (byName.has(tool.name)) {
            throw new Error(`Duplicate host tool name: ${tool.name}`);
        }
        byName.set(tool.name, tool);
    }
    return byName;
}
