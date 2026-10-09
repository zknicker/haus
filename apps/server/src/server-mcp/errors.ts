import { Data } from 'effect';

export type McpUpstreamCode = 'MCP_AUTH_REQUIRED' | 'MCP_TIMEOUT' | 'MCP_UNAVAILABLE';

/** Foreign MCP client construction failed before a usable client existed. */
export class McpClientAcquireError extends Data.TaggedError('McpClientAcquireError')<{
    readonly cause: unknown;
}> {}

/** The cache retired an entry while an acquisition or operation was still in flight. */
export class McpClientRetiredError extends Data.TaggedError('McpClientRetiredError') {}

export type McpIconIoOperation =
    | 'mcp.icon.fetch'
    | 'mcp.icon.response.inspect'
    | 'mcp.icon.reader.acquire'
    | 'mcp.icon.reader.cancel'
    | 'mcp.icon.reader.read'
    | 'mcp.icon.reader.release';

/** Foreign icon fetch or stream IO failed; icon resolution can safely fall back. */
export class McpIconIoError extends Data.TaggedError('McpIconIoError')<{
    readonly cause: unknown;
    readonly operation: McpIconIoOperation;
}> {}

export class McpDeniedError extends Error {
    readonly code = 'MCP_DENIED';
}

/** Operator-facing reconnect requirement raised when a stored OAuth grant needs a new browser flow. */
export class McpReconnectRequiredError extends Error {
    constructor() {
        super('Reconnect this MCP server in Haus.');
        this.name = 'McpReconnectRequiredError';
    }
}

/** Closed, content-free classification recorded as `haus.failure.kind` on MCP spans. */
export type McpUpstreamFailureKind =
    | 'auth'
    | 'http_status'
    | 'jsonrpc'
    | 'other'
    | 'protocol'
    | 'timeout'
    | 'transport';

export class McpUpstreamError extends Error {
    readonly failureKind: McpUpstreamFailureKind;

    constructor(
        readonly code: McpUpstreamCode,
        message: string,
        options?: ErrorOptions & { failureKind?: McpUpstreamFailureKind }
    ) {
        super(message, options);
        this.name = 'McpUpstreamError';
        this.failureKind = options?.failureKind ?? defaultFailureKind(code);
    }
}

export type McpFailureKind = 'error' | 'mcp-tagged' | 'null' | 'object' | 'primitive';

/** Safe diagnostic classification; never inspect or serialize foreign error text. */
export function mcpFailureKind(cause: unknown): McpFailureKind {
    if (cause === null) {
        return 'null';
    }
    if (typeof cause !== 'object' && typeof cause !== 'function') {
        return 'primitive';
    }
    try {
        if (
            cause instanceof McpClientAcquireError ||
            cause instanceof McpClientRetiredError ||
            cause instanceof McpIconIoError
        ) {
            return 'mcp-tagged';
        }
        return cause instanceof Error ? 'error' : 'object';
    } catch {
        return 'object';
    }
}

export function asMcpArguments(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    throw new McpDeniedError('MCP tool arguments must be an object.');
}

function defaultFailureKind(code: McpUpstreamCode): McpUpstreamFailureKind {
    if (code === 'MCP_AUTH_REQUIRED') {
        return 'auth';
    }
    return code === 'MCP_TIMEOUT' ? 'timeout' : 'other';
}
