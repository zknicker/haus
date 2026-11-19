import {
    agentWorkerCancelInputSchema,
    agentWorkerListInputSchema,
    agentWorkerSendInputSchema,
    agentWorkerStartInputSchema,
} from '@haus/api';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { announceRunEngagements } from '../agent-delivery/chat-engagement-events.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { MessageCauseError } from '../automations/message-cause.ts';
import { AgentAuthorNotFoundError } from '../chats/agent-authored-message.ts';
import { ChatArchivedError } from '../chats/chat-access.ts';
import { InvalidInlineReplyError } from '../chats/reply-context.ts';
import type { ComputerConnections } from '../computers/connections.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { createWorker } from '../workers/create-worker.ts';
import {
    WorkerAgentNotFoundError,
    WorkerCancelDeniedError,
    WorkerComputerRemovedError,
    WorkerNotLaunchedError,
    WorkerTaskRequiredError,
    WorkerConflictError,
    WorkerNotFoundError,
    WorkerSettledError,
} from '../workers/errors.ts';
import { listAgentWorker } from '../workers/list-agent-worker.ts';
import { requestWorkerCancel } from '../workers/request-worker-cancel.ts';
import { sendWorker } from '../workers/send-worker.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';
import { AgentTargetError } from './resolve-target.ts';
import { requireCancellableWorkAgent } from './workers.ts';

/**
 * The Agent-scoped Worker routes. The Computer calls these behind its
 * loopback proxy after its own provider readiness check, so Server never
 * reaches a provider and never sees the instructions the provider runs.
 */
export function registerAgentWorkerRoutes(
    app: FastifyInstance,
    dependencies: {
        agentDelivery: AgentDelivery;
        computers: ComputerConnections;
        db: HausDatabase;
        postCommitWork: ServerPostCommitWork;
    }
) {
    app.get('/api/agent/workers', async (request, reply) => {
        const runner = await authorizeAgentRunner(dependencies.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const parsed = agentWorkerListInputSchema.safeParse(request.query);
        if (!parsed.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The Worker query was invalid.');
        }
        try {
            return {
                workers: await listAgentWorker(dependencies.db, runner, parsed.data.workerId),
            };
        } catch (cause) {
            return sendWorkerFailure(reply, cause);
        }
    });
    app.post('/api/agent/workers/send', async (request, reply) => {
        const runner = await authorizeAgentRunner(dependencies.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const parsed = agentWorkerSendInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                'The follow-up request was invalid.'
            );
        }
        try {
            const sent = await sendWorker(dependencies.db, runner, parsed.data);
            for (const event of sent.events) {
                publishRealtime(event);
            }
            return sent.receipt;
        } catch (cause) {
            return sendWorkerFailure(reply, cause);
        }
    });
    app.post('/api/agent/workers', async (request, reply) => {
        const runner = await authorizeAgentRunner(dependencies.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const parsed = agentWorkerStartInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The Worker request was invalid.');
        }
        try {
            const created = await createWorker(
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
            return sendWorkerFailure(reply, cause);
        }
    });

    app.post('/api/agent/workers/cancel', async (request, reply) => {
        const runner = await authorizeAgentRunner(dependencies.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const parsed = agentWorkerCancelInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The cancel request was invalid.');
        }
        try {
            await requireCancellableWorkAgent(dependencies.db, {
                agentId: runner.agentId,
                serverId: runner.serverId,
                workerId: parsed.data.workerId,
            });
            const requested = await requestWorkerCancel(dependencies.db, {
                requestedBy: { id: runner.agentId, kind: 'agent' },
                serverId: runner.serverId,
                workerId: parsed.data.workerId,
            });
            for (const event of requested.events) {
                publishRealtime(event);
            }
            for (const command of requested.commands) {
                dependencies.computers.send(requested.computerId, command);
            }
            return { worker: requested.work };
        } catch (cause) {
            return sendWorkerFailure(reply, cause);
        }
    });
}

function sendWorkerFailure(
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
            'The expanded Worker message exceeds the content limit.'
        );
    }
    if (cause instanceof WorkerNotLaunchedError) {
        return sendAgentApiError(reply, 409, 'WORKER_NOT_LAUNCHED', cause.message);
    }
    if (cause instanceof WorkerConflictError) {
        return sendAgentApiError(reply, 409, 'WORKER_IDEMPOTENCY_CONFLICT', cause.message);
    }
    if (cause instanceof WorkerNotFoundError) {
        return sendAgentApiError(reply, 404, 'WORKER_NOT_FOUND', cause.message);
    }
    if (cause instanceof WorkerSettledError) {
        return sendAgentApiError(reply, 409, 'WORKER_SETTLED', cause.message);
    }
    if (cause instanceof WorkerComputerRemovedError) {
        return sendAgentApiError(reply, 409, 'WORKER_COMPUTER_REMOVED', cause.message);
    }
    if (cause instanceof WorkerCancelDeniedError) {
        return sendAgentApiError(reply, 403, 'WORKER_CANCEL_DENIED', cause.message);
    }
    if (cause instanceof WorkerAgentNotFoundError) {
        return sendAgentApiError(reply, 409, 'WORKER_NO_COMPUTER', cause.message, {
            nextAction: 'Ask an Owner or Admin to assign this Agent a Computer.',
        });
    }
    if (cause instanceof AgentAuthorNotFoundError) {
        return sendAgentApiError(reply, 404, 'WORKER_FAILED', cause.message);
    }
    if (cause instanceof AgentTargetError) {
        return sendAgentApiError(reply, 404, 'INVALID_TARGET', cause.message);
    }
    if (cause instanceof WorkerTaskRequiredError) {
        // The Computer proxy forwards only code and message, so the fix rides the message.
        return sendAgentApiError(reply, 400, 'WORKER_TASK_REQUIRED', cause.message);
    }
    if (cause instanceof ChatArchivedError) {
        return sendAgentApiError(reply, 409, 'TARGET_READ_ONLY', cause.message);
    }
    return sendAgentApiError(reply, 500, 'SERVER_5XX', 'The Server could not record the Worker.');
}
