import {
    agentCloudAgentCancelInputSchema,
    agentCloudAgentListInputSchema,
    agentCloudAgentSendInputSchema,
    agentCloudAgentStartInputSchema,
} from '@haus/api';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { announceRunEngagements } from '../agent-delivery/chat-engagement-events.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { MessageCauseError } from '../automations/message-cause.ts';
import { AgentAuthorNotFoundError } from '../chats/agent-authored-message.ts';
import { ChatArchivedError } from '../chats/chat-access.ts';
import { InvalidInlineReplyError } from '../chats/reply-context.ts';
import { createCloudAgentWork } from '../cloud-agents/create-cloud-agent-work.ts';
import {
    CloudAgentAgentNotFoundError,
    CloudAgentCancelDeniedError,
    CloudAgentComputerRemovedError,
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
import { publishRealtime } from '../realtime/topic.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';
import { requireCancellableWorkAgent } from './cloud-agents.ts';
import { ThreadNotOpenError } from './resolve-send-target.ts';
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
            for (const event of sent.events) {
                publishRealtime(event);
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
            if (created.kind === 'held') {
                // The hold showed the run news it has now read and not answered.
                void dependencies.postCommitWork.run('chat.engagement.announce', () =>
                    announceRunEngagements(dependencies.db, runner)
                );
                return created.held;
            }
            for (const event of created.events) {
                publishRealtime(event);
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
            for (const event of requested.events) {
                publishRealtime(event);
            }
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
    if (cause instanceof MessageCauseError) {
        return sendAgentApiError(reply, 400, 'INVALID_ARG', cause.message);
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
    if (cause instanceof CloudAgentComputerRemovedError) {
        return sendAgentApiError(reply, 409, 'CLOUD_AGENT_COMPUTER_REMOVED', cause.message);
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
    if (cause instanceof ThreadNotOpenError) {
        // The Computer proxy forwards only code and message, so the fix rides the message.
        const anchor = cause.anchorMessageId.replace(/^msg_/u, '').slice(0, 8);
        return sendAgentApiError(
            reply,
            400,
            'CLOUD_AGENT_NEW_THREAD',
            `A cloud agent launch can't open a new thread; its card gets its own work thread. Reply inline instead: --target "${cause.parentTarget}" --reply-to ${anchor}`
        );
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
