import { agentAskInputSchema } from '@haus/api';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { createAsk } from '../asks/create-ask.ts';
import { AskConflictError, InvalidAskAddresseeError } from '../asks/errors.ts';
import { AgentAuthorNotFoundError } from '../chats/agent-authored-message.ts';
import { ChatArchivedError } from '../chats/chat-access.ts';
import { emitDurableChatEvent } from '../chats/durable-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';
import { AgentTargetError } from './resolve-target.ts';

export function registerAgentAskRoutes(
    app: FastifyInstance,
    dependencies: {
        agentDelivery: AgentDelivery;
        db: HausDatabase;
        postCommitWork: ServerPostCommitWork;
    }
) {
    app.post('/api/agent/asks', async (request, reply) => {
        const runner = await authorizeAgentRunner(dependencies.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }

        const parsed = agentAskInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The Ask request was invalid.');
        }

        try {
            const created = await createAsk(
                dependencies.db,
                runner,
                parsed.data,
                dependencies.agentDelivery
            );
            for (const event of created.events) {
                emitDurableChatEvent({ audienceUserId: null, event });
            }
            await dependencies.postCommitWork.wakeAgents(dependencies.agentDelivery, created.wakes);
            return created.receipt;
        } catch (cause) {
            return sendAskFailure(reply, cause);
        }
    });
}

function sendAskFailure(reply: FastifyReply, cause: unknown) {
    if (cause instanceof ZodError) {
        return sendAgentApiError(
            reply,
            400,
            'INVALID_ARG',
            'The expanded Ask message exceeds the content limit.'
        );
    }
    if (cause instanceof AskConflictError) {
        return sendAgentApiError(reply, 409, 'ASK_IDEMPOTENCY_CONFLICT', cause.message);
    }
    if (cause instanceof InvalidAskAddresseeError) {
        return sendAgentApiError(reply, 404, 'ASK_ADDRESSEE_NOT_FOUND', cause.message, {
            nextAction: 'Run haus server info --humans to see who can be addressed.',
        });
    }
    if (cause instanceof AgentAuthorNotFoundError) {
        return sendAgentApiError(reply, 404, 'ASK_FAILED', cause.message);
    }
    if (cause instanceof AgentTargetError) {
        return sendAgentApiError(reply, 404, 'INVALID_TARGET', cause.message);
    }
    if (cause instanceof ChatArchivedError) {
        return sendAgentApiError(reply, 409, 'TARGET_READ_ONLY', cause.message);
    }
    return sendAgentApiError(reply, 500, 'SERVER_5XX', 'The Server could not post the Ask.');
}
