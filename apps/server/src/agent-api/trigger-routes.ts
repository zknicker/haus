import {
    agentTriggerCreateInputSchema,
    agentTriggerUpdateInputSchema,
    githubTriggerPreviewInputSchema,
    linearTriggerPreviewInputSchema,
    triggerLogLimitDefault,
    triggerLogLimitMax,
} from '@haus/api';
import type { FastifyInstance, FastifyReply } from 'fastify';
import * as z from 'zod';
import { ChatArchivedError, ChatNotFoundError } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    ReminderAgentInactiveError,
    ReminderAnchorAccessError,
} from '../reminders/reminder-model.ts';
import type { TriggerAuthoringServices } from '../triggers/operator-triggers.ts';
import { TriggerNotFoundError, TriggerRequestRefusedError } from '../triggers/trigger-model.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';
import { AgentTargetError } from './resolve-target.ts';
import {
    createAgentTrigger,
    deleteAgentTrigger,
    listAgentTriggers,
    previewAgentTrigger,
    readAgentTrigger,
    readAgentTriggerLog,
    rotateAgentTriggerSecret,
    setAgentTriggerStatus,
    updateAgentTrigger,
} from './triggers.ts';

const idParamsSchema = z.object({ id: z.string().min(1).max(200) });
/** A GitHub body with its event name, or a raw Linear body. */
const previewInputSchema = z.union([
    githubTriggerPreviewInputSchema,
    linearTriggerPreviewInputSchema,
]);
const logQuerySchema = z.object({
    fire: z.string().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(triggerLogLimitMax).default(triggerLogLimitDefault),
});

/**
 * The Agent's own trigger surface, reached with the scoped runner credential.
 * Every route is bound to the credential's Agent and Server: an Agent can only
 * ever see and change triggers it owns.
 */
export function registerAgentTriggerRoutes(
    app: FastifyInstance,
    db: HausDatabase,
    services: TriggerAuthoringServices
) {
    app.post('/api/agent/triggers', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return unauthorized(reply);
        }
        const parsed = agentTriggerCreateInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return invalid(reply);
        }
        return await runAction(reply, () =>
            createAgentTrigger(db, runner, request, parsed.data, services)
        );
    });

    app.get('/api/agent/triggers', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return unauthorized(reply);
        }
        return await runAction(reply, () => listAgentTriggers(db, runner, request));
    });

    app.get('/api/agent/triggers/:id', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = idParamsSchema.safeParse(request.params);
        if (!runner) {
            return unauthorized(reply);
        }
        if (!parsed.success) {
            return invalid(reply);
        }
        return await runAction(reply, () => readAgentTrigger(db, runner, request, parsed.data.id));
    });

    app.patch('/api/agent/triggers/:id', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return unauthorized(reply);
        }
        const params = idParamsSchema.safeParse(request.params);
        const body = agentTriggerUpdateInputSchema.safeParse(request.body);
        if (!(params.success && body.success)) {
            return invalid(reply);
        }
        return await runAction(reply, () =>
            updateAgentTrigger(
                db,
                runner,
                request,
                { ...body.data, triggerId: params.data.id },
                services
            )
        );
    });

    app.post('/api/agent/triggers/:id/preview', { bodyLimit: 65_536 }, async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return unauthorized(reply);
        }
        const params = idParamsSchema.safeParse(request.params);
        const body = previewInputSchema.safeParse(request.body);
        if (!(params.success && body.success)) {
            return invalid(reply);
        }
        return await runAction(reply, () =>
            previewAgentTrigger(db, services, runner, request, {
                ...body.data,
                triggerId: params.data.id,
            })
        );
    });

    for (const [action, status] of [
        ['disable', 'disabled'],
        ['enable', 'armed'],
    ] as const) {
        app.post(`/api/agent/triggers/:id/${action}`, async (request, reply) => {
            const runner = await authorizeAgentRunner(db, request);
            const parsed = idParamsSchema.safeParse(request.params);
            if (!runner) {
                return unauthorized(reply);
            }
            if (!parsed.success) {
                return invalid(reply);
            }
            return await runAction(reply, () =>
                setAgentTriggerStatus(db, runner, request, { status, triggerId: parsed.data.id })
            );
        });
    }

    app.post('/api/agent/triggers/:id/rotate', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = idParamsSchema.safeParse(request.params);
        if (!runner) {
            return unauthorized(reply);
        }
        if (!parsed.success) {
            return invalid(reply);
        }
        return await runAction(reply, () =>
            rotateAgentTriggerSecret(db, runner, request, parsed.data.id)
        );
    });

    app.delete('/api/agent/triggers/:id', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = idParamsSchema.safeParse(request.params);
        if (!runner) {
            return unauthorized(reply);
        }
        if (!parsed.success) {
            return invalid(reply);
        }
        return await runAction(reply, () =>
            deleteAgentTrigger(db, runner, request, parsed.data.id)
        );
    });

    app.get('/api/agent/triggers/:id/log', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const params = idParamsSchema.safeParse(request.params);
        const query = logQuerySchema.safeParse(request.query);
        if (!runner) {
            return unauthorized(reply);
        }
        if (!(params.success && query.success)) {
            return invalid(reply);
        }
        return await runAction(reply, () =>
            readAgentTriggerLog(db, runner, request, {
                fireId: query.data.fire,
                limit: query.data.limit,
                triggerId: params.data.id,
            })
        );
    });
}

async function runAction(reply: FastifyReply, action: () => Promise<unknown>) {
    try {
        return await action();
    } catch (cause) {
        if (cause instanceof TriggerNotFoundError || cause instanceof AgentTargetError) {
            return sendAgentApiError(reply, 404, 'INVALID_TARGET', cause.message);
        }
        if (cause instanceof TriggerRequestRefusedError) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', cause.message);
        }
        if (cause instanceof ChatArchivedError) {
            return sendAgentApiError(reply, 409, 'TARGET_READ_ONLY', cause.message);
        }
        if (
            cause instanceof ChatNotFoundError ||
            cause instanceof ReminderAgentInactiveError ||
            cause instanceof ReminderAnchorAccessError
        ) {
            return sendAgentApiError(reply, 409, 'INVALID_ARG', cause.message);
        }
        throw cause;
    }
}

function unauthorized(reply: FastifyReply) {
    return sendAgentApiError(reply, 401, 'MISSING_TOKEN', 'A valid runner credential is required.');
}

function invalid(reply: FastifyReply) {
    return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The trigger request was invalid.');
}
