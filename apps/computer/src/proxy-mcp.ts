import { McpResponseTooLargeError, readMcpResponseText } from './mcp-response.ts';

export function mcpRequestHeaders(request: Request): Record<string, string> {
    const id = request.headers.get('x-haus-mcp-request-id');
    return isMcpRequest(request) && id ? { 'x-haus-mcp-request-id': id } : {};
}

export function mcpRequestSignal(request: Request): AbortSignal | undefined {
    return isMcpRequest(request) ? request.signal : undefined;
}

function isMcpRequest(request: Request) {
    return new URL(request.url).pathname.startsWith('/api/agent/mcp/');
}

/**
 * Read the Server response body for the Agent. A body that cannot be read (oversize MCP result,
 * dropped stream) becomes a typed JSON error naming the Server status instead of escaping as an
 * untyped proxy failure.
 */
export async function readProxyResponse(
    request: Request,
    response: Response
): Promise<string | Response> {
    const mcp = isMcpRequest(request);
    try {
        return mcp ? await readMcpResponseText(response) : await response.text();
    } catch (cause) {
        return Response.json(
            {
                code: mcp ? 'MCP_UNAVAILABLE' : 'UPSTREAM_UNAVAILABLE',
                message:
                    cause instanceof McpResponseTooLargeError
                        ? cause.message
                        : `The Server response could not be read (HTTP ${response.status}).`,
            },
            { status: 502 }
        );
    }
}
