import * as z from 'zod';
import {
    type HostTool,
    type HostToolOutput,
    type HostToolSet,
    hostToolJsonSchema,
} from './host-tool.ts';

// JSON-RPC handling for the host-tool MCP server: stateless Streamable HTTP with JSON
// responses, the same shape as the hosted Linear connector.

const supportedVersions = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'];
const latestVersion = '2025-11-25';

export const rpcIdSchema = z.union([z.string(), z.number()]);
export type RpcId = z.infer<typeof rpcIdSchema>;

export const rpcMessageSchema = z.object({
    id: rpcIdSchema.optional(),
    jsonrpc: z.literal('2.0'),
    method: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
});
export type RpcMessage = z.infer<typeof rpcMessageSchema>;

const callParamsSchema = z.object({
    arguments: z.record(z.string(), z.unknown()).optional(),
    name: z.string(),
});
export const cancelParamsSchema = z.object({ requestId: rpcIdSchema });

export type RpcReply =
    | { readonly error: { code: number; message: string }; readonly id: RpcId | null }
    | { readonly id: RpcId; readonly result: unknown };

export function initializeResult(params: RpcMessage['params'], serverName: string) {
    const requested = params?.protocolVersion;
    return {
        capabilities: { tools: { listChanged: false } },
        protocolVersion:
            typeof requested === 'string' && supportedVersions.includes(requested)
                ? requested
                : latestVersion,
        serverInfo: { name: serverName, version: '1.0.0' },
    };
}

export function listToolsResult(tools: HostToolSet) {
    return {
        tools: tools.map((tool) => ({
            description: tool.description,
            inputSchema: hostToolJsonSchema(tool),
            name: tool.name,
        })),
    };
}

/** Tool failures become MCP tool errors; only an unknown tool is a protocol error. */
export async function callTool(input: {
    id: RpcId;
    params: RpcMessage['params'];
    signal: AbortSignal;
    tools: ReadonlyMap<string, HostTool>;
}): Promise<RpcReply> {
    const call = callParamsSchema.safeParse(input.params);
    const tool = call.success ? input.tools.get(call.data.name) : undefined;
    if (!(call.success && tool)) {
        return rpcError(input.id, -32_602, 'Unknown tool');
    }
    try {
        const output = await tool.execute(call.data.arguments ?? {}, {
            signal: input.signal,
            toolCallId: String(input.id),
        });
        input.signal.throwIfAborted();
        return { id: input.id, result: toolResult(output) };
    } catch (cause) {
        if (input.signal.aborted) {
            return rpcError(input.id, -32_800, 'Request cancelled');
        }
        return {
            id: input.id,
            result: { content: [{ text: errorText(cause), type: 'text' }], isError: true },
        };
    }
}

export function rpcError(id: RpcId | null, code: number, message: string): RpcReply {
    return { error: { code, message }, id };
}

export function rpcResponse(reply: RpcReply, headers?: Record<string, string>): Response {
    return Response.json(
        { jsonrpc: '2.0', ...reply },
        { headers, status: reply.id === null ? 400 : 200 }
    );
}

function toolResult(output: HostToolOutput) {
    if (output.type === 'text') {
        return { content: [{ text: output.text, type: 'text' }] };
    }
    const text = JSON.stringify(output.value) ?? 'null';
    return isRecord(output.value)
        ? { content: [{ text, type: 'text' }], structuredContent: output.value }
        : { content: [{ text, type: 'text' }] };
}

function errorText(cause: unknown): string {
    if (cause instanceof z.ZodError) {
        return `Invalid arguments: ${z.prettifyError(cause)}`;
    }
    return cause instanceof Error ? cause.message : 'The tool failed.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
