import {
    OAuthError,
    ProtocolError,
    SdkError,
    SdkErrorCode,
    SdkHttpError,
    UnauthorizedError,
} from '@modelcontextprotocol/client';
import { McpDeniedError, McpUpstreamError } from './errors.ts';

export type McpClientFailureScope = 'operation' | 'session';
const SESSION_HTTP_STATUSES = new Set([401, 403, 404]);
const SESSION_CODES = new Set<string>([
    SdkErrorCode.ConnectionClosed,
    SdkErrorCode.NotConnected,
    SdkErrorCode.NotInitialized,
    SdkErrorCode.SendFailed,
]);

/** Request failures keep sibling calls alive; broken transports and credentials retire the client. */
export function classifyMcpClientFailure(cause: unknown): McpClientFailureScope {
    if (cause instanceof McpUpstreamError) {
        return classifyUpstreamFailure(cause);
    }
    if (cause instanceof McpDeniedError || cause instanceof ProtocolError) {
        return 'operation';
    }
    if (cause instanceof UnauthorizedError || cause instanceof OAuthError) {
        return 'session';
    }
    if (cause instanceof SdkHttpError) {
        return SESSION_HTTP_STATUSES.has(cause.status) ? 'session' : 'operation';
    }
    if (cause instanceof SdkError) {
        return SESSION_CODES.has(cause.code) ? 'session' : 'operation';
    }
    if (cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'TimeoutError')) {
        return 'operation';
    }
    return 'session';
}

function classifyUpstreamFailure(cause: McpUpstreamError): McpClientFailureScope {
    if (cause.code === 'MCP_AUTH_REQUIRED') {
        return 'session';
    }
    if (cause.cause === undefined) {
        return cause.code === 'MCP_TIMEOUT' ? 'operation' : 'session';
    }
    return classifyMcpClientFailure(cause.cause);
}
