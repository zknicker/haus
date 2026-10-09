import { expect, test } from 'bun:test';
import { UnauthorizedError } from '@ai-sdk/mcp';
import { McpReconnectRequiredError } from './errors.ts';
import { classifyMcpUpstreamError, sanitizeUpstreamReason } from './upstream-failure.ts';

function aiSdkError(marker: string, message: string, fields: Record<string, unknown> = {}) {
    const error = Object.assign(new Error(message), fields);
    Reflect.set(error, Symbol.for(`vercel.ai.error.${marker}`), true);
    return error;
}

test('OAuth and reconnect failures without an HTTP status require reconnecting', () => {
    for (const cause of [
        new UnauthorizedError(),
        new McpReconnectRequiredError(),
        aiSdkError('AI_MCPClientOAuthError', 'invalid_grant: refresh token revoked'),
    ]) {
        expect(classifyMcpUpstreamError(cause, 'invocation')).toMatchObject({
            code: 'MCP_AUTH_REQUIRED',
            failureKind: 'auth',
            message: 'Reconnect this MCP connection before using it.',
        });
    }
});

test('HTTP failures name the status and never echo the response body or URL', () => {
    const cause = aiSdkError(
        'AI_MCPClientError',
        'MCP HTTP Transport Error: POSTing to endpoint (HTTP 500): <html>secret-body</html>',
        { responseBody: '<html>secret-body</html>', statusCode: 500, url: 'https://mcp.test/x' }
    );
    const classified = classifyMcpUpstreamError(cause, 'invocation');
    expect(classified).toMatchObject({ code: 'MCP_UNAVAILABLE', failureKind: 'http_status' });
    expect(classified.message).toBe('The MCP invocation is unavailable: upstream HTTP 500.');
});

test('JSON-RPC errors keep their code even when the text mentions a timeout', () => {
    const cause = aiSdkError('AI_MCPClientError', 'Upstream API timed out', { code: -32_603 });
    expect(classifyMcpUpstreamError(cause, 'discovery')).toMatchObject({
        code: 'MCP_UNAVAILABLE',
        failureKind: 'jsonrpc',
        message:
            'The MCP discovery is unavailable: upstream JSON-RPC error -32603: Upstream API timed out',
    });
});

test('library timeouts, network failures, and unknown values stay generic', () => {
    expect(
        classifyMcpUpstreamError(
            aiSdkError('AI_MCPClientError', 'Request timed out after 30000ms'),
            'invocation'
        )
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
