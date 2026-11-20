import { randomUUID } from 'node:crypto';
import {
    AGENT_DISPATCH_ID_HEADER,
    AGENT_DISPATCH_OUTCOME_UNKNOWN,
    type DispatchKey,
    dispatchIdOf,
    agentMcpInvocationSchema,
    agentMcpResultSchema,
    agentMcpSearchSchema,
    agentMcpToolsSchema,
} from '@haus/api';
import * as z from 'zod';
import type { RunAuthority } from '../run-context.ts';

const responseBytesMax = 1024 * 1024;

const errorSchema = z.object({
    code: z
        .enum([
            AGENT_DISPATCH_OUTCOME_UNKNOWN,
            'MCP_AUTH_REQUIRED',
            'MCP_DENIED',
            'MCP_TIMEOUT',
            'MCP_UNAVAILABLE',
        ])
        .catch('MCP_UNAVAILABLE'),
    message: z.string().min(1).optional().catch(undefined),
});

export class McpToolError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.code = code;
        this.name = 'McpToolError';
    }
}

export type McpClient = ReturnType<typeof createMcpClient>;

export function createMcpClient(authority: RunAuthority) {
    const request = async (
        path: string,
        signal: AbortSignal,
        options: { body?: unknown; dispatch?: DispatchKey } = {}
    ) => {
        const requestId = randomUUID();
        let cancellation: Promise<void> | undefined;
        const cancel = () => {
            cancellation ??= fetch(new URL('/api/agent/mcp/cancel', authority.serverUrl), {
                body: JSON.stringify({ requestId }),
                headers: {
                    authorization: `Bearer ${authority.runCredential}`,
                    'content-type': 'application/json',
                },
                method: 'POST',
                signal: AbortSignal.timeout(2000),
            })
                .then(async (response) => {
                    await response.body?.cancel();
                })
                .catch(() => undefined);
        };
        signal.addEventListener('abort', cancel, { once: true });
        try {
            signal.throwIfAborted();
            const response = await fetch(new URL(`/api/agent/mcp/${path}`, authority.serverUrl), {
                headers: {
                    authorization: `Bearer ${authority.runCredential}`,
                    'x-haus-mcp-request-id': requestId,
                    ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
                    ...(options.dispatch
                        ? { [AGENT_DISPATCH_ID_HEADER]: dispatchIdOf(options.dispatch) }
                        : {}),
                },
                method: options.body === undefined ? 'GET' : 'POST',
                signal,
                ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
            });
            return await readPayload(response, signal);
        } finally {
            signal.removeEventListener('abort', cancel);
            await cancellation;
        }
    };
    return {
        async search(query: string, signal: AbortSignal) {
            return parseResult(
                agentMcpSearchSchema,
                await request(`tools?${new URLSearchParams({ query })}`, signal)
            );
        },
        async describe(name: string, signal: AbortSignal) {
            const { tools } = parseResult(
                agentMcpToolsSchema,
                await request(`tools?${new URLSearchParams({ name })}`, signal)
            );
            return tools.find((tool) => tool.name === name);
        },
        async invoke(toolName: string, args: unknown, dispatch: DispatchKey, signal: AbortSignal) {
            const body = agentMcpInvocationSchema.parse({ args, toolName });
            return parseResult(
                agentMcpResultSchema,
                await request('invoke', signal, { body, dispatch })
            ).result;
        },
    };
}

async function readPayload(response: Response, signal: AbortSignal) {
    const { status } = response;
    let text: string;
    try {
        text = await readBounded(response);
    } catch (cause) {
        signal.throwIfAborted();
        throw new McpToolError(
            'MCP_UNAVAILABLE',
            cause instanceof McpToolError
                ? cause.message
                : `The Server MCP response could not be read (HTTP ${status}).`
        );
    }
    const payload = parseJson(text);
    if (response.ok && payload !== undefined) {
        return payload;
    }
    const error = response.ok ? undefined : errorSchema.safeParse(payload).data;
    if (error) {
        throw new McpToolError(
            error.code,
            error.message ?? `The Server MCP request failed (HTTP ${status}).`
        );
    }
    throw new McpToolError(
        'MCP_UNAVAILABLE',
        `The Server MCP request returned ${payload === undefined ? 'a non-JSON' : 'an untyped'} response (HTTP ${status}).`
    );
}

async function readBounded(response: Response) {
    if (!response.body) {
        throw new Error('Server MCP returned an empty response.');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
            bytes += chunk.value.byteLength;
            if (bytes > responseBytesMax) {
                throw new McpToolError(
                    'MCP_UNAVAILABLE',
                    'Server MCP response exceeded its 1 MiB size limit. Narrow the request.'
                );
            }
            chunks.push(chunk.value);
        }
        return Buffer.concat(chunks).toString('utf8');
    } finally {
        await reader.cancel();
        reader.releaseLock();
    }
}

function parseResult<T>(schema: z.ZodType<T>, payload: unknown) {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
        throw new McpToolError(
            'MCP_UNAVAILABLE',
            'The Server MCP response had an unexpected shape.'
        );
    }
    return parsed.data;
}

function parseJson(text: string) {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return undefined;
    }
}
