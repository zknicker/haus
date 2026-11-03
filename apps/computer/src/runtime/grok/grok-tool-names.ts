import * as z from 'zod';

/**
 * Grok's builtins that Haus knows by a common name (activity-tool-fixtures.ts keys); the native
 * name travels as `nativeName`. Every other Grok builtin keeps its own name (`read_file`,
 * `list_dir`, `image_gen`, `web_fetch`, `search_tool`, ...).
 */
const COMMON_NAMES: Readonly<Record<string, string>> = {
    grep: 'grep',
    run_terminal_command: 'bash',
    search_replace: 'edit',
    web_search: 'webSearch',
    write: 'write',
};

const toolMetaSchema = z.looseObject({
    'x.ai/tool': z
        .looseObject({ name: z.string().min(1).optional(), namespace: z.string().optional() })
        .optional(),
});

const useToolInputSchema = z.looseObject({
    tool_input: z.unknown().optional(),
    tool_name: z.string().min(1),
});

/** Who runs a Grok tool call, and the names Haus reports it under. */
export type GrokToolIdentity =
    | { readonly kind: 'builtin'; readonly nativeName?: string; readonly toolName: string }
    | { readonly input: unknown; readonly kind: 'host'; readonly toolName: string };

/**
 * Grok 1.0.13 defers MCP tools behind `search_tool` and calls them through `use_tool` with
 * `tool_name: "<server>__<tool>"`; an MCP tool it calls directly carries namespace `mcp`. A call
 * to the Haus host-tool server is a Haus host tool, reported by its own name and input.
 */
export function grokToolIdentity(input: {
    hostServerName: string;
    meta: unknown;
    rawInput: unknown;
    title: unknown;
}): GrokToolIdentity {
    const tool = toolMetaSchema.safeParse(input.meta);
    const xaiTool = tool.success ? tool.data['x.ai/tool'] : undefined;
    const native =
        xaiTool?.name ?? (typeof input.title === 'string' && input.title ? input.title : 'tool');
    const hostPrefix = `${input.hostServerName}__`;
    if (native === 'use_tool') {
        const call = useToolInputSchema.safeParse(input.rawInput);
        if (call.success && call.data.tool_name.startsWith(hostPrefix)) {
            return {
                input: call.data.tool_input ?? {},
                kind: 'host',
                toolName: call.data.tool_name.slice(hostPrefix.length),
            };
        }
    }
    if (xaiTool?.namespace === 'mcp' && native.startsWith(hostPrefix)) {
        return {
            input: input.rawInput ?? {},
            kind: 'host',
            toolName: native.slice(hostPrefix.length),
        };
    }
    const common = COMMON_NAMES[native];
    return common && common !== native
        ? { kind: 'builtin', nativeName: native, toolName: common }
        : { kind: 'builtin', toolName: native };
}

const mcpOutputSchema = z.looseObject({ output: z.unknown(), type: z.literal('MCP') });

/** A host tool's own result from Grok's MCP `rawOutput` (`{ OkayOutput: ... }`). */
export function grokHostToolOutput(rawOutput: unknown): unknown {
    const parsed = mcpOutputSchema.safeParse(rawOutput);
    if (!parsed.success) {
        return rawOutput ?? {};
    }
    const output = parsed.data.output;
    if (typeof output === 'object' && output !== null && !Array.isArray(output)) {
        const values = Object.values(output);
        return values.length === 1 ? values[0] : output;
    }
    return output;
}
