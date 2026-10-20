import { randomBytes, randomUUID } from 'node:crypto';
import { type HostTool, type HostToolSet, hostToolsByName } from './host-tool.ts';
import {
    callTool,
    cancelParamsSchema,
    initializeResult,
    listToolsResult,
    type RpcMessage,
    rpcError,
    rpcMessageSchema,
    rpcResponse,
} from './mcp-rpc.ts';

/**
 * One loopback MCP server per Computer process. Each Agent session opens its own scope with a
 * bearer token, so an Agent lists and calls only its own host tools.
 */
export interface HostToolServer {
    openSession(tools: HostToolSet): HostToolSession;
    stop(): Promise<void>;
}

export interface HostToolSession {
    /** Aborts in-flight calls and revokes the token. */
    close(): void;
    readonly mcp: HostToolMcpDescriptor;
    /** Swap tools for later calls (for example a new turn's proxy token); the token is stable. */
    replaceTools(tools: HostToolSet): void;
}

/** What a runtime driver renders into its CLI's MCP config. */
export interface HostToolMcpDescriptor {
    readonly headers: { readonly Authorization: string };
    readonly name: string;
    readonly transport: 'http';
    readonly url: string;
}

export function startHostToolServer(options: { name?: string } = {}): HostToolServer {
    const name = options.name ?? 'haus';
    const scopes = new Map<string, SessionScope>();
    const server = Bun.serve({
        fetch: (request) => handle(request, scopes, name),
        hostname: '127.0.0.1',
        idleTimeout: 0,
        port: 0,
    });
    const url = `http://127.0.0.1:${server.port}/mcp`;
    return {
        openSession(tools) {
            const token = randomBytes(32).toString('base64url');
            const scope: SessionScope = {
                closed: new AbortController(),
                inflight: new Map(),
                mcpSessions: new Set(),
                tools: hostToolsByName(tools),
                toolList: tools,
            };
            scopes.set(token, scope);
            return {
                close() {
                    scopes.delete(token);
                    scope.closed.abort(new Error('The host-tool session closed.'));
                },
                mcp: {
                    headers: { Authorization: `Bearer ${token}` },
                    name,
                    transport: 'http',
                    url,
                },
                replaceTools(next) {
                    scope.tools = hostToolsByName(next);
                    scope.toolList = next;
                },
            };
        },
        async stop() {
            for (const scope of scopes.values()) {
                scope.closed.abort(new Error('The host-tool server stopped.'));
            }
            scopes.clear();
            await server.stop(true);
        },
    };
}

interface SessionScope {
    readonly closed: AbortController;
    readonly inflight: Map<string, AbortController>;
    readonly mcpSessions: Set<string>;
    toolList: HostToolSet;
    tools: ReadonlyMap<string, HostTool>;
}

const mcpSessionHeader = 'mcp-session-id';

async function handle(
    request: Request,
    scopes: ReadonlyMap<string, SessionScope>,
    name: string
): Promise<Response> {
    if (new URL(request.url).pathname !== '/mcp') {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const scope = scopes.get(bearerToken(request) ?? '');
    if (!scope) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const mcpSession = request.headers.get(mcpSessionHeader);
    if (mcpSession !== null && !scope.mcpSessions.has(mcpSession)) {
        return Response.json({ error: 'Unknown MCP session' }, { status: 404 });
    }
    if (request.method === 'DELETE' && mcpSession !== null) {
        scope.mcpSessions.delete(mcpSession);
        return new Response(null, { status: 204 });
    }
    if (request.method !== 'POST') {
        return new Response(null, { headers: { Allow: 'POST, DELETE' }, status: 405 });
    }
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return rpcResponse(rpcError(null, -32_700, 'Parse error'));
    }
    const message = rpcMessageSchema.safeParse(body);
    if (!message.success) {
        // JSON-RPC responses from the client carry no method; nothing to answer.
        return isClientResponse(body)
            ? new Response(null, { status: 202 })
            : rpcResponse(rpcError(null, -32_600, 'Invalid request'));
    }
    return await dispatch(message.data, { mcpSession, name, request, scope });
}

async function dispatch(
    message: RpcMessage,
    context: { mcpSession: string | null; name: string; request: Request; scope: SessionScope }
): Promise<Response> {
    const { id, method, params } = message;
    const { scope } = context;
    if (id === undefined) {
        if (method === 'notifications/cancelled') {
            const cancel = cancelParamsSchema.safeParse(params);
            if (cancel.success) {
                scope.inflight
                    .get(inflightKey(context.mcpSession, cancel.data.requestId))
                    ?.abort(new Error('The MCP client cancelled the call.'));
            }
        }
        return new Response(null, { status: 202 });
    }
    switch (method) {
        case 'initialize': {
            const session = randomUUID();
            scope.mcpSessions.add(session);
            return rpcResponse(
                { id, result: initializeResult(params, context.name) },
                { 'Mcp-Session-Id': session }
            );
        }
        case 'ping':
            return rpcResponse({ id, result: {} });
        case 'tools/list':
            return rpcResponse({ id, result: listToolsResult(scope.toolList) });
        case 'tools/call': {
            const key = inflightKey(context.mcpSession, id);
            const cancel = new AbortController();
            scope.inflight.set(key, cancel);
            try {
                const signal = AbortSignal.any([
                    cancel.signal,
                    context.request.signal,
                    scope.closed.signal,
                ]);
                return rpcResponse(await callTool({ id, params, signal, tools: scope.tools }));
            } finally {
                if (scope.inflight.get(key) === cancel) {
                    scope.inflight.delete(key);
                }
            }
        }
        default:
            return rpcResponse(rpcError(id, -32_601, 'Method not found'));
    }
}

function bearerToken(request: Request): string | undefined {
    const header = request.headers.get('authorization');
    return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
}

function inflightKey(mcpSession: string | null, id: number | string): string {
    return `${mcpSession ?? ''}\u0000${typeof id}:${id}`;
}

function isClientResponse(body: unknown): boolean {
    return (
        typeof body === 'object' &&
        body !== null &&
        'id' in body &&
        ('result' in body || 'error' in body)
    );
}
