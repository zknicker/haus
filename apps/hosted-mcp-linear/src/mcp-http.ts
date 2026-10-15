import {
    type LinearCallResultMeta,
    type LinearMutation,
    type LinearToolName,
    linearCallMetaSchema,
    linearMetaKey,
} from '@haus/api/linear-actor-meta';
import * as z from 'zod';
import { linearTools } from './catalog.ts';
import { createLinearGraphql } from './linear-graphql.ts';
import { LinearToolError } from './tool-error.ts';

// Stateless MCP Streamable HTTP with JSON responses: no sessions, no server
// streams, no state between requests. The private socket is the only way in
// (ADR 0042), and every credential arrives in the call's own `_meta`.

const supportedVersions = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'];
const latestVersion = '2025-11-25';
/** Reply before the Server's own invocation timeout fires. */
const deadlineMarginMs = 250;

const messageSchema = z.object({
    id: z.union([z.string(), z.number()]).optional(),
    jsonrpc: z.literal('2.0'),
    method: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
});
const callParamsSchema = z.object({
    _meta: z.record(z.string(), z.unknown()).optional(),
    arguments: z.record(z.string(), z.unknown()).optional(),
    name: z.string(),
});

export function createLinearMcpHandler(options: { fetch?: typeof fetch } = {}) {
    const send = options.fetch ?? fetch;
    return async (request: Request): Promise<Response> => {
        const { pathname } = new URL(request.url);
        if (pathname === '/healthz') {
            return Response.json({ status: 'ok' });
        }
        if (pathname !== '/mcp') {
            return Response.json({ error: 'Not found' }, { status: 404 });
        }
        if (request.method !== 'POST') {
            return new Response(null, { headers: { Allow: 'POST' }, status: 405 });
        }
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return rpcError(null, -32_700, 'Parse error');
        }
        const message = messageSchema.safeParse(body);
        if (!message.success) {
            return rpcError(null, -32_600, 'Invalid request');
        }
        const { id, method, params } = message.data;
        if (id === undefined) {
            return new Response(null, { status: 202 });
        }
        switch (method) {
            case 'initialize':
                return rpcResult(id, initialize(params));
            case 'ping':
                return rpcResult(id, {});
            case 'tools/list':
                return rpcResult(id, { tools: listTools() });
            case 'tools/call':
                return await callTool(id, params, send);
            default:
                return rpcError(id, -32_601, 'Method not found');
        }
    };
}

function initialize(params: Record<string, unknown> | undefined) {
    const requested = params?.protocolVersion;
    return {
        capabilities: { tools: { listChanged: false } },
        protocolVersion:
            typeof requested === 'string' && supportedVersions.includes(requested)
                ? requested
                : latestVersion,
        serverInfo: { name: 'haus-linear', version: '1.0.0' },
    };
}

function listTools() {
    return [...linearTools.values()].map((tool) => ({
        annotations: { openWorldHint: true, readOnlyHint: tool.readOnly },
        description: tool.description,
        inputSchema: tool.inputSchema,
        name: tool.name,
    }));
}

async function callTool(
    id: number | string,
    params: Record<string, unknown> | undefined,
    send: typeof fetch
): Promise<Response> {
    const call = callParamsSchema.safeParse(params);
    const tool = call.success ? linearTools.get(call.data.name as LinearToolName) : undefined;
    if (!(call.success && tool)) {
        return rpcError(id, -32_602, 'Unknown tool');
    }
    // Never echo why `_meta` failed: its values are credentials.
    const meta = linearCallMetaSchema.safeParse(call.data._meta?.[linearMetaKey]);
    if (!meta.success) {
        return rpcError(id, -32_602, 'Linear actor metadata is missing or invalid.');
    }
    const signal = AbortSignal.timeout(meta.data.deadlineMs - deadlineMarginMs);
    const mutations: LinearMutation[] = [];
    const context = {
        fetch: send,
        linear: createLinearGraphql({ accessToken: meta.data.accessToken, fetch: send, signal }),
        meta: meta.data,
        mutations,
        signal,
    };
    try {
        const result = await tool.call(context, call.data.arguments);
        return rpcResult(id, {
            _meta: resultMeta(true, mutations),
            content: [{ text: JSON.stringify(result), type: 'text' }],
            isError: false,
            structuredContent: result,
        });
    } catch (cause) {
        const error =
            cause instanceof LinearToolError
                ? cause
                : new LinearToolError(
                      'linear_upstream_error',
                      'The Linear connector failed unexpectedly.'
                  );
        return rpcResult(id, {
            _meta: resultMeta(false, mutations),
            content: [{ text: `${error.code}: ${error.message}`, type: 'text' }],
            isError: true,
            structuredContent: error.toStructured(),
        });
    }
}

function resultMeta(completed: boolean, mutations: LinearMutation[]) {
    const meta: LinearCallResultMeta = { completed, mutations };
    return { [linearMetaKey]: meta };
}

function rpcResult(id: number | string, result: unknown) {
    return Response.json({ id, jsonrpc: '2.0', result });
}

function rpcError(id: number | string | null, code: number, message: string) {
    return Response.json(
        { error: { code, message }, id, jsonrpc: '2.0' },
        { status: id === null ? 400 : 200 }
    );
}
