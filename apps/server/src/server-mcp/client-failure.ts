import { UnauthorizedError } from '@ai-sdk/mcp';
import { McpDeniedError, McpUpstreamError } from './errors.ts';

/**
 * Which part of a shared MCP client a failed operation proves broken.
 * - `operation`: only that request failed; the session still serves sibling calls.
 * - `session`: the transport, session, or credentials are unusable; rebuild the client.
 */
export type McpClientFailureScope = 'operation' | 'session';

/**
 * Classify against what `@ai-sdk/mcp` 2.x throws. `MCPClientError` is not exported, so it is
 * recognized by the AI SDK error marker. Unknown failures (network `TypeError`, OAuth provider
 * errors, Effect defects) count as `session` so a broken client is never kept.
 */
export function classifyMcpClientFailure(cause: unknown): McpClientFailureScope {
    if (cause instanceof McpUpstreamError) {
        if (cause.code === 'MCP_AUTH_REQUIRED') {
            return 'session';
        }
        // A cause-less MCP_TIMEOUT is the per-call deadline in upstream-operation.ts.
        if (cause.cause === undefined) {
            return cause.code === 'MCP_TIMEOUT' ? 'operation' : 'session';
        }
        return classifyMcpClientFailure(cause.cause);
    }
    if (cause instanceof McpDeniedError) {
        return 'operation';
    }
    if (cause instanceof UnauthorizedError) {
        return 'session';
    }
    if (isMcpClientError(cause)) {
        return classifyMcpClientError(cause);
    }
    if (cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'TimeoutError')) {
        return 'operation';
    }
    return 'session';
}

interface McpClientErrorShape {
    readonly code?: unknown;
    readonly message: string;
    readonly statusCode?: unknown;
}

/** Messages `MCPClient` uses once its transport has closed (`onClose`, `request`). */
const CLOSED_CLIENT_MESSAGES = new Set([
    'Attempted to send a request from a closed client',
    'Connection closed',
]);
/** 401/403: credentials need a refresh or reconnect. 404: the HTTP session expired. */
const SESSION_HTTP_STATUSES = new Set([401, 403, 404]);
const MCP_CLIENT_ERROR_MARKER = Symbol.for('vercel.ai.error.AI_MCPClientError');

function classifyMcpClientError(error: McpClientErrorShape): McpClientFailureScope {
    if (typeof error.statusCode === 'number') {
        return SESSION_HTTP_STATUSES.has(error.statusCode) ? 'session' : 'operation';
    }
    // A JSON-RPC error response (`code`), request timeout, abort, or parse failure is per-request.
    if (typeof error.code === 'number') {
        return 'operation';
    }
    return CLOSED_CLIENT_MESSAGES.has(error.message) ? 'session' : 'operation';
}

function isMcpClientError(cause: unknown): cause is McpClientErrorShape {
    return (
        cause instanceof Error &&
        MCP_CLIENT_ERROR_MARKER in cause &&
        Reflect.get(cause, MCP_CLIENT_ERROR_MARKER) === true
    );
}
