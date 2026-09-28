import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import { publishCommittedAgentActivity } from '../agent-delivery/activity-events.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { emitDurableChatEvent } from '../chats/durable-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { authorizeAgentRunner, sendAgentApiError, sendAgentReadError } from './auth.ts';
import { claimAgentTasks } from './task-claims.ts';
import { createAgentTasks } from './task-create.ts';
import { listAgentTasks, TASK_LIST_STATUSES } from './task-list.ts';
import { unclaimAgentTask, updateAgentTask } from './tasks.ts';

const taskStatusSchema = z.enum(['todo', 'in_progress', 'in_review', 'done', 'closed']);

export function registerAgentTaskRoutes(
    app: FastifyInstance,
    options: {
        agentDelivery: AgentDelivery;
        db: HausDatabase;
        postCommitWork: ServerPostCommitWork;
    }
) {
    const { agentDelivery, db, postCommitWork } = options;
    app.get('/api/agent/tasks', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = z
            .object({
                mine: z.enum(['true', 'false']).optional(),
                status: z.enum(TASK_LIST_STATUSES).optional(),
                target: z.string().optional(),
            })
            .safeParse(request.query);
        if (!(runner && parsed.success)) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The task request was invalid.');
        }
        try {
            return await listAgentTasks(db, runner, {
                ...parsed.data,
                mine: parsed.data.mine === 'true',
            });
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    app.post('/api/agent/tasks/create', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = z
            .object({
                assignee: z.string().optional(),
                content: z.string().optional(),
                nonce: z.string().min(1).max(100),
                target: z.string().min(1),
                titles: z.array(z.string().min(1)).max(20).optional(),
            })
            .safeParse(request.body);
        if (!(runner && parsed.success)) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The task request was invalid.');
        }
        try {
            const result = await createAgentTasks(db, runner, parsed.data, agentDelivery);
            for (const activity of result.activities) {
                publishCommittedAgentActivity(activity);
            }
            emitTaskEvents(result.events);
            await postCommitWork.wakeAgents(agentDelivery, result.wakes);
            return { tasks: result.tasks };
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    app.post('/api/agent/tasks/claim', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = z
            .object({
                messageId: z.string().optional(),
                numbers: z.array(z.number().int().positive()).max(20).optional(),
                target: z.string().min(1),
            })
            .safeParse(request.body);
        if (!(runner && parsed.success)) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The task request was invalid.');
        }
        try {
            const result = await claimAgentTasks(db, runner, parsed.data);
            emitTaskEvents(result.events);
            return { results: result.results };
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    for (const action of ['unclaim', 'update'] as const) {
        app.post(`/api/agent/tasks/${action}`, async (request, reply) => {
            const runner = await authorizeAgentRunner(db, request);
            const parsed = z
                .object({
                    number: z.number().int().positive(),
                    status: taskStatusSchema.optional(),
                    target: z.string().min(1),
                })
                .safeParse(request.body);
            if (!(runner && parsed.success) || (action === 'update' && !parsed.data.status)) {
                return sendAgentApiError(
                    reply,
                    400,
                    'INVALID_ARG',
                    'The task request was invalid.'
                );
            }
            try {
                const result =
                    action === 'unclaim'
                        ? await unclaimAgentTask(db, runner, parsed.data)
                        : await updateAgentTask(db, runner, {
                              ...parsed.data,
                              status: parsed.data.status as z.infer<typeof taskStatusSchema>,
                          });
                if (result.event) {
                    emitTaskEvents([result.event]);
                }
                return { task: result.task };
            } catch (cause) {
                return sendAgentReadError(reply, cause);
            }
        });
    }
}

function emitTaskEvents(events: Parameters<typeof emitDurableChatEvent>[0]['event'][]) {
    for (const event of events) {
        emitDurableChatEvent({ audienceUserId: null, event });
    }
}
