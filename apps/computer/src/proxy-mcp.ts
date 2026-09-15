import { readMcpResponseText } from './mcp-response.ts';

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

export function readProxyResponse(request: Request, response: Response): Promise<string> {
    return isMcpRequest(request) ? readMcpResponseText(response) : response.text();
}
