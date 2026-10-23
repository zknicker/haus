import { agentTaskCreateInputSchema } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import { publishCommittedAgentActivity } from '../agent-delivery/activity-events.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { isHeartbeatRun } from '../heartbeat/run-source.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { authorizeAgentRunner, sendAgentApiError, sendAgentReadError } from './auth.ts';
import { assignAgentTask } from './task-assign.ts';
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
        const parsed = agentTaskCreateInputSchema.safeParse(request.body);
        if (!(runner && parsed.success)) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The task request was invalid.');
        }
        try {
            const result = await createAgentTasks(db, runner, parsed.data, agentDelivery);
            for (const activity of result.activities) {
                publishCommittedAgentActivity(activity);
            }
            publishRealtime(result.events);
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
        // A heartbeat's throwaway session cannot follow replies or finish a tracked task.
        if (await isHeartbeatRun(db, runner)) {
            return sendAgentApiError(
                reply,
                403,
                'REGULAR_TURN_REQUIRED',
                'haus task claim does not work in a heartbeat run. Use haus lead claim.'
            );
        }
        try {
            const result = await claimAgentTasks(db, runner, parsed.data);
            publishRealtime(result.events);
            return { results: result.results };
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    for (const action of ['assign', 'unassign'] as const) {
        app.post(`/api/agent/tasks/${action}`, async (request, reply) => {
            const runner = await authorizeAgentRunner(db, request);
            const parsed = z
                .object({
                    assignee: z.string().min(1).optional(),
                    expectedRevision: z.number().int().nonnegative().optional(),
                    number: z.number().int().positive(),
                    target: z.string().min(1),
                })
                .safeParse(request.body);
            const assignee = parsed.success ? (parsed.data.assignee ?? null) : null;
            if (!(runner && parsed.success) || (action === 'assign') !== (assignee !== null)) {
                return sendAgentApiError(
                    reply,
                    400,
                    'INVALID_ARG',
                    'The task request was invalid.'
                );
            }
            try {
                const result = await assignAgentTask(db, runner, agentDelivery, {
                    ...parsed.data,
                    assignee,
                });
                publishRealtime(result.events);
                await postCommitWork.wakeAgents(
                    agentDelivery,
                    result.wakes.map((agentId) => ({ agentId, serverId: runner.serverId }))
                );
                return { task: result.task };
            } catch (cause) {
                return sendAgentReadError(reply, cause);
            }
        });
    }

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
                    publishRealtime(result.event);
                }
                return { task: result.task };
            } catch (cause) {
                return sendAgentReadError(reply, cause);
            }
        });
    }
}
