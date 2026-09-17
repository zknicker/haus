import {
    agentCloudAgentCancelInputSchema,
    agentCloudAgentListInputSchema,
    agentCloudAgentSendInputSchema,
    agentCloudAgentStartInputSchema,
} from '@haus/api';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { AgentAuthorNotFoundError } from '../chats/agent-authored-message.ts';
import { ChatArchivedError } from '../chats/chat-access.ts';
import { emitDurableChatEvent } from '../chats/durable-events.ts';
import { InvalidInlineReplyError } from '../chats/reply-context.ts';
import { createCloudAgentWork } from '../cloud-agents/create-cloud-agent-work.ts';
import {
    CloudAgentAgentNotFoundError,
    CloudAgentCancelDeniedError,
    CloudAgentNotLaunchedError,
    CloudAgentWorkConflictError,
    CloudAgentWorkNotFoundError,
    CloudAgentWorkSettledError,
} from '../cloud-agents/errors.ts';
import { listAgentCloudAgentWork } from '../cloud-agents/list-agent-cloud-agent-work.ts';
import { requestCloudAgentCancel } from '../cloud-agents/request-cloud-agent-cancel.ts';
import { sendCloudAgentWork } from '../cloud-agents/send-cloud-agent-work.ts';
import type { ComputerConnections } from '../computers/connections.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';
import { requireCancellableWorkAgent } from './cloud-agents.ts';
import { AgentTargetError } from './resolve-target.ts';

/**
 * The Agent-scoped Cloud Agent routes. The Computer calls these behind its
 * loopback proxy after its own provider readiness check, so Server never
 * reaches a provider and never sees the instructions the provider runs.
 */
export function registerAgentCloudAgentRoutes(
    app: FastifyInstance,
    dependencies: {
        agentDelivery: AgentDelivery;
        computers: ComputerConnections;
        db: HausDatabase;
        postCommitWork: ServerPostCommitWork;
    }
) {
    app.get('/api/agent/cloud-agents', async (request, reply) => {
        const runner = await authorizeAgentRunner(dependencies.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const parsed = agentCloudAgentListInputSchema.safeParse(request.query);
        if (!parsed.success) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                'The Cloud Agent query was invalid.'
            );
        }
        try {
            return {
                works: await listAgentCloudAgentWork(dependencies.db, runner, parsed.data.workId),
            };
        } catch (cause) {
            return sendCloudAgentFailure(reply, cause);
        }
    });
    app.post('/api/agent/cloud-agents/send', async (request, reply) => {
        const runner = await authorizeAgentRunner(dependencies.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const parsed = agentCloudAgentSendInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                'The follow-up request was invalid.'
            );
        }
        try {
            const sent = await sendCloudAgentWork(dependencies.db, runner, parsed.data);
            if (sent.event) {
                emitDurableChatEvent({ audienceUserId: null, event: sent.event });
            }
            return sent.receipt;
        } catch (cause) {
            return sendCloudAgentFailure(reply, cause);
        }
    });
    app.post('/api/agent/cloud-agents', async (request, reply) => {
        const runner = await authorizeAgentRunner(dependencies.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const parsed = agentCloudAgentStartInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                'The Cloud Agent request was invalid.'
            );
        }
        try {
            const created = await createCloudAgentWork(
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
            return sendCloudAgentFailure(reply, cause);
        }
    });

    app.post('/api/agent/cloud-agents/cancel', async (request, reply) => {
        const runner = await authorizeAgentRunner(dependencies.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const parsed = agentCloudAgentCancelInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The cancel request was invalid.');
        }
        try {
            await requireCancellableWorkAgent(dependencies.db, {
                agentId: runner.agentId,
                serverId: runner.serverId,
                workId: parsed.data.workId,
            });
            const requested = await requestCloudAgentCancel(dependencies.db, {
                requestedBy: { id: runner.agentId, kind: 'agent' },
                serverId: runner.serverId,
                workId: parsed.data.workId,
            });
            emitDurableChatEvent({ audienceUserId: null, event: requested.event });
            dependencies.computers.send(requested.computerId, requested.command);
            return { work: requested.work };
        } catch (cause) {
            return sendCloudAgentFailure(reply, cause);
        }
    });
}

function sendCloudAgentFailure(
    reply: Parameters<typeof sendAgentApiError>[0],
    cause: unknown
): unknown {
    if (cause instanceof InvalidInlineReplyError) {
        return sendAgentApiError(reply, 400, 'INVALID_REPLY', cause.message);
    }
    if (cause instanceof ZodError) {
        return sendAgentApiError(
            reply,
            400,
            'INVALID_ARG',
            'The expanded Cloud Agent message exceeds the content limit.'
        );
    }
    if (cause instanceof CloudAgentNotLaunchedError) {
        return sendAgentApiError(reply, 409, 'CLOUD_AGENT_NOT_LAUNCHED', cause.message);
    }
    if (cause instanceof CloudAgentWorkConflictError) {
        return sendAgentApiError(reply, 409, 'CLOUD_AGENT_IDEMPOTENCY_CONFLICT', cause.message);
    }
    if (cause instanceof CloudAgentWorkNotFoundError) {
        return sendAgentApiError(reply, 404, 'CLOUD_AGENT_WORK_NOT_FOUND', cause.message);
    }
    if (cause instanceof CloudAgentWorkSettledError) {
        return sendAgentApiError(reply, 409, 'CLOUD_AGENT_WORK_SETTLED', cause.message);
    }
    if (cause instanceof CloudAgentCancelDeniedError) {
        return sendAgentApiError(reply, 403, 'CLOUD_AGENT_CANCEL_DENIED', cause.message);
    }
    if (cause instanceof CloudAgentAgentNotFoundError) {
        return sendAgentApiError(reply, 409, 'CLOUD_AGENT_NO_COMPUTER', cause.message, {
            nextAction: 'Ask an Owner or Admin to assign this Agent a Computer.',
        });
    }
    if (cause instanceof AgentAuthorNotFoundError) {
        return sendAgentApiError(reply, 404, 'CLOUD_AGENT_FAILED', cause.message);
    }
    if (cause instanceof AgentTargetError) {
        return sendAgentApiError(reply, 404, 'INVALID_TARGET', cause.message);
    }
    if (cause instanceof ChatArchivedError) {
        return sendAgentApiError(reply, 409, 'TARGET_READ_ONLY', cause.message);
    }
    return sendAgentApiError(
        reply,
        500,
        'SERVER_5XX',
        'The Server could not record the Cloud Agent work.'
    );
}
