import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import type { HausDatabase } from '../postgres/connection.ts';
import { authorizeAgentRunner, sendAgentApiError, sendAgentReadError } from './auth.ts';
import { readAgentChannelInfo, readAgentChannelMembers } from './directory.ts';

const targetSchema = z.object({ target: z.string().trim().min(1).max(200) });

/** What a channel is and who belongs to it. Agents have no channel membership to change. */
export function registerAgentChannelRoutes(app: FastifyInstance, options: { db: HausDatabase }) {
    const { db } = options;

    app.get('/api/agent/channels/info', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = targetSchema.safeParse(request.query);
        if (!(runner && parsed.success)) {
            return invalidChannelRequest(reply);
        }
        try {
            return await readAgentChannelInfo(db, runner, parsed.data.target);
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    app.get('/api/agent/channels/members', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = targetSchema.safeParse(request.query);
        if (!(runner && parsed.success)) {
            return invalidChannelRequest(reply);
        }
        try {
            return await readAgentChannelMembers(db, runner, parsed.data.target);
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });
}

function invalidChannelRequest(reply: Parameters<typeof sendAgentApiError>[0]): unknown {
    return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The channel request was invalid.');
}
