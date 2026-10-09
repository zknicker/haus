import { UnauthorizedError } from '@ai-sdk/mcp';
import { McpReconnectRequiredError, McpUpstreamError } from './errors.ts';

type McpOperation = 'discovery' | 'invocation';

/** MCP 2026-07-28 request-validation codes (header mismatch and friends). */
const PROTOCOL_ERROR_CODES = new Set([-32_020, -32_021, -32_022]);
const MCP_CLIENT_ERROR_MARKER = Symbol.for('vercel.ai.error.AI_MCPClientError');
const MCP_OAUTH_ERROR_MARKER = Symbol.for('vercel.ai.error.AI_MCPClientOAuthError');
const REASON_LIMIT = 200;

/**
 * Map a foreign MCP failure to a stable runner code plus a safe reason. The Agent sees an
 * upstream HTTP status or JSON-RPC code, and for JSON-RPC errors a short sanitized copy of the
 * upstream message. HTTP response bodies, URLs, and library-composed text never leave Server.
 */
export function classifyMcpUpstreamError(
    cause: unknown,
    operation: McpOperation
): McpUpstreamError {
    if (cause instanceof McpUpstreamError) {
        return cause;
    }
    const status = readNumber(cause, 'statusCode') ?? readNumber(cause, 'status');
    if (isAuthFailure(cause) || status === 401 || status === 403) {
        return new McpUpstreamError(
            'MCP_AUTH_REQUIRED',
            'Reconnect this MCP connection before using it.',
            { cause, failureKind: 'auth' }
        );
    }
    const unavailable = `The MCP ${operation} is unavailable`;
    // A JSON-RPC error is an upstream answer, even when its text mentions a timeout.
    const rpcCode = isMcpClientError(cause) ? readNumber(cause, 'code') : undefined;
    if (rpcCode !== undefined && cause instanceof Error) {
        const reason = sanitizeUpstreamReason(cause.message);
        return new McpUpstreamError(
            'MCP_UNAVAILABLE',
            `${unavailable}: upstream JSON-RPC error ${rpcCode}${reason ? `: ${reason}` : '.'}`,
            { cause, failureKind: PROTOCOL_ERROR_CODES.has(rpcCode) ? 'protocol' : 'jsonrpc' }
        );
    }
    if (isTimeout(cause)) {
        return new McpUpstreamError('MCP_TIMEOUT', `The MCP ${operation} timed out.`, {
            cause,
            failureKind: 'timeout',
        });
    }
    if (status !== undefined) {
        return new McpUpstreamError('MCP_UNAVAILABLE', `${unavailable}: upstream HTTP ${status}.`, {
            cause,
            failureKind: 'http_status',
        });
    }
    return new McpUpstreamError('MCP_UNAVAILABLE', `${unavailable}.`, {
        cause,
        failureKind: isTransportFailure(cause) ? 'transport' : 'other',
    });
}

/** Single line, bounded, with URLs and credential-shaped runs redacted. */
export function sanitizeUpstreamReason(message: string): string {
    const cleaned = message
        .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
        .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/giu, '[url]')
        .replace(/\bBearer\s+\S+/giu, 'Bearer [redacted]')
        .replace(/[A-Za-z0-9_\-+/=.]{32,}/gu, '[redacted]')
        .replace(/\s+/gu, ' ')
        .trim();
    return cleaned.length > REASON_LIMIT ? `${cleaned.slice(0, REASON_LIMIT - 1)}…` : cleaned;
}

function isAuthFailure(cause: unknown): boolean {
    return (
        cause instanceof UnauthorizedError ||
        cause instanceof McpReconnectRequiredError ||
        hasMarker(cause, MCP_OAUTH_ERROR_MARKER)
    );
}

function isMcpClientError(cause: unknown): boolean {
    return hasMarker(cause, MCP_CLIENT_ERROR_MARKER);
}

function isTransportFailure(cause: unknown): boolean {
    const code = readString(cause, 'code') ?? '';
    return cause instanceof TypeError || /^(?:E[A-Z]+|UND_ERR_[A-Z_]+)$/u.test(code);
}

function isTimeout(cause: unknown): boolean {
    if (!(cause instanceof Error)) {
        return false;
    }
    const code = readString(cause, 'code');
    return (
        cause.name === 'AbortError' ||
        code === 'ETIMEDOUT' ||
        code === 'UND_ERR_CONNECT_TIMEOUT' ||
        /\b(?:abort|timed?\s*out|timeout)\b/iu.test(cause.message)
    );
}

function hasMarker(value: unknown, marker: symbol): boolean {
    return value instanceof Error && marker in value && Reflect.get(value, marker) === true;
}

function readNumber(value: unknown, key: string): number | undefined {
    if (typeof value !== 'object' || value === null || !(key in value)) {
        return undefined;
    }
    const property = Reflect.get(value, key);
    return typeof property === 'number' ? property : undefined;
}

function readString(value: unknown, key: string): string | undefined {
    if (typeof value !== 'object' || value === null || !(key in value)) {
        return undefined;
    }
    const property = Reflect.get(value, key);
    return typeof property === 'string' ? property : undefined;
}
