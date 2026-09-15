import { agentMcpRequestIdSchema } from '@haus/api';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import * as z from 'zod';
import type { HausDatabase } from '../postgres/connection.ts';
import { McpRequests } from '../server-mcp/requests.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

export function registerMcpCancellation(app: FastifyInstance, db: HausDatabase) {
    const requests = new McpRequests();
    app.addHook('onClose', async () => requests.close());
    app.post('/api/agent/mcp/cancel', async (request, reply) => {
        const parsed = z
            .object({ requestId: agentMcpRequestIdSchema })
            .strict()
            .safeParse(request.body);
        const token = bearerToken(request);
        if (!(parsed.success && token)) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                'The MCP cancellation was invalid.'
            );
        }
        // A revoked runner may still cancel work it already started, never another runner's work.
        if (!requests.cancelExisting(token, parsed.data.requestId)) {
            if (!(await authorizeAgentRunner(db, request))) {
                return sendAgentApiError(
                    reply,
                    401,
                    'MISSING_TOKEN',
                    'A valid runner credential is required.'
                );
            }
            requests.cancel(token, parsed.data.requestId);
        }
        return { cancelled: true };
    });
    return (request: FastifyRequest) => {
        const parsed = agentMcpRequestIdSchema.safeParse(request.headers['x-haus-mcp-request-id']);
        if (!parsed.success) {
            return undefined;
        }
        const requestId = parsed.data;
        const token = bearerToken(request);
        if (!token) {
            throw new Error('An MCP request requires a runner credential.');
        }
        return requests.begin(token, requestId);
    };
}

function bearerToken(request: FastifyRequest) {
    const value = request.headers.authorization;
    return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7) : undefined;
}
