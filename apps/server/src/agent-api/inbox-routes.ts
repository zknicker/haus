import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import type { HausDatabase } from '../postgres/connection.ts';
import { authorizeAgentRunner, sendAgentApiError, sendAgentReadError } from './auth.ts';
import { attestAgentEvents, inspectAgentInbox, pullAgentEvents } from './inbox.ts';

const visibleEventsSchema = z.object({
    messages: z
        .array(
            z.object({
                chatId: z.string().min(1),
                id: z.string().min(1),
                sequence: z.number().int().positive(),
            })
        )
        .min(1)
        .max(100),
    /** A drain the turn prompt carried: exact visibility only, rows stay offered. */
    composed: z.boolean().optional(),
});

export function registerAgentInboxRoutes(app: FastifyInstance, db: HausDatabase) {
    app.get('/api/agent/events', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        try {
            return await pullAgentEvents(db, runner);
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });
    app.post('/api/agent/events/visible', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const body = visibleEventsSchema.safeParse(request.body);
        if (!body.success) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_INPUT',
                'Invalid visible message receipt.'
            );
        }
        try {
            return await attestAgentEvents(db, runner, body.data.messages, {
                composed: body.data.composed === true,
            });
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });
    app.get('/api/agent/inbox', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        try {
            return await inspectAgentInbox(db, runner);
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });
}
