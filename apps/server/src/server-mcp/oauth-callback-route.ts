import type { FastifyInstance } from 'fastify';
import type { McpOAuthRelay } from './oauth-relay.ts';

export function registerMcpOAuthCallback(app: FastifyInstance, relay: McpOAuthRelay): void {
    app.get('/mcp/oauth/callback', async (request, response) => {
        const query = request.query as { code?: string; state?: string; iss?: string };
        const result =
            query.code && query.state
                ? await relay.complete(query.state, query.code, query.iss)
                : ({ status: 'expired' } as const);
        const copy = callbackCopy(result.status);
        response
            .code(result.status === 'complete' ? 200 : 400)
            .header('content-type', 'text/html; charset=utf-8')
            .send(
                `<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>${copy.title}</title></head><body><main><h1>${copy.title}</h1><p>${copy.message}</p></main></body></html>`
            );
    });
}

function callbackCopy(status: 'complete' | 'expired' | 'failed') {
    if (status === 'complete') {
        return {
            message: 'You can close this window and return to Haus.',
            title: 'Connection complete',
        };
    }
    if (status === 'failed') {
        return {
            message: 'Return to Haus and try connecting again.',
            title: 'Connection failed',
        };
    }
    return {
        message: 'Return to Haus and start the connection again.',
        title: 'Connection expired',
    };
}
