import { expect, test } from 'bun:test';
import {
    OAuthError,
    ProtocolError,
    SdkError,
    SdkErrorCode,
    SdkHttpError,
    UnauthorizedError,
} from '@modelcontextprotocol/client';
import { McpReconnectRequiredError } from './errors.ts';
import { classifyMcpUpstreamError, sanitizeUpstreamReason } from './upstream-failure.ts';

function sdkError(message: string, fields: Record<string, unknown> = {}) {
    if (typeof fields.statusCode === 'number') {
        return new SdkHttpError(SdkErrorCode.ClientHttpUnexpectedContent, message, {
            status: fields.statusCode,
        });
    }
    if (typeof fields.code === 'number') {
        return new ProtocolError(fields.code, message);
    }
    return new SdkError(SdkErrorCode.RequestTimeout, message);
}

test('OAuth and reconnect failures without an HTTP status require reconnecting', () => {
    for (const cause of [
        new UnauthorizedError(),
        new McpReconnectRequiredError(),
        new OAuthError('invalid_grant', 'invalid_grant: refresh token revoked'),
    ]) {
        expect(classifyMcpUpstreamError(cause, 'invocation')).toMatchObject({
            code: 'MCP_AUTH_REQUIRED',
            failureKind: 'auth',
            message: 'Reconnect this MCP connection before using it.',
        });
    }
});

test('HTTP failures name the status and never echo the response body or URL', () => {
    const cause = sdkError(
        'MCP HTTP Transport Error: POSTing to endpoint (HTTP 500): <html>secret-body</html>',
        { responseBody: '<html>secret-body</html>', statusCode: 500, url: 'https://mcp.test/x' }
    );
    const classified = classifyMcpUpstreamError(cause, 'invocation');
    expect(classified).toMatchObject({ code: 'MCP_UNAVAILABLE', failureKind: 'http_status' });
    expect(classified.message).toBe('The MCP invocation is unavailable: upstream HTTP 500.');
});

test('JSON-RPC errors keep their code even when the text mentions a timeout', () => {
    const cause = sdkError('Upstream API timed out', { code: -32_603 });
    expect(classifyMcpUpstreamError(cause, 'discovery')).toMatchObject({
        code: 'MCP_UNAVAILABLE',
        failureKind: 'jsonrpc',
        message:
            'The MCP discovery is unavailable: upstream JSON-RPC error -32603: Upstream API timed out',
    });
});

test('library timeouts, network failures, and unknown values stay generic', () => {
    expect(
        classifyMcpUpstreamError(sdkError('Request timed out after 30000ms'), 'invocation')
    ).toMatchObject({ code: 'MCP_TIMEOUT', failureKind: 'timeout' });
    expect(classifyMcpUpstreamError(new TypeError('fetch failed'), 'invocation')).toMatchObject({
        code: 'MCP_UNAVAILABLE',
        failureKind: 'transport',
        message: 'The MCP invocation is unavailable.',
    });
    expect(classifyMcpUpstreamError('boom', 'invocation')).toMatchObject({
        failureKind: 'other',
    });
});

test('upstream reasons are single-line, bounded, and redact URLs and credentials', () => {
    const reason = sanitizeUpstreamReason(
        `bad\nrequest https://api.test/x?token=1 Bearer ghp_abc ${'k'.repeat(40)} ${'x'.repeat(300)}`
    );
    expect(reason).toStartWith('bad request [url] Bearer [redacted] [redacted]');
    expect(reason).not.toContain('ghp_abc');
    expect(reason.length).toBeLessThanOrEqual(200);
});
