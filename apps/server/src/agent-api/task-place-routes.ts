import {
    agentTaskStartInputSchema,
    agentTaskStateInputSchema,
    formatTaskTarget,
    type Task,
} from '@haus/api';
import type { FastifyInstance } from 'fastify';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { TaskWriteResult } from '../tasks/task-assignment.ts';
import { findTask } from '../tasks/task-list.ts';
import { setTaskState } from '../tasks/task-set-state.ts';
import { startTask } from '../tasks/task-start.ts';
import { resolveAgentMessage } from './message-read.ts';
import { resolveAgentTarget } from './resolve-target.ts';
import { agentActor, resolveTaskAssignee } from './task-refs.ts';
import { agentTaskWrite, withImplicitVersion } from './task-route-shell.ts';

export function registerAgentTaskPlaceRoutes(
    app: FastifyInstance,
    options: {
        agentDelivery: AgentDelivery;
        commit: (runner: ResolvedRunner, result: TaskWriteResult) => Promise<unknown>;
        db: HausDatabase;
    }
) {
    const { agentDelivery, commit, db } = options;

    agentTaskWrite(
        app,
        db,
        { body: agentTaskStartInputSchema, path: '/api/agent/tasks/start' },
        async (runner, input) => {
            const originChatId = await resolveAgentTarget(db, runner, input.target);
            const origin = await resolveAgentMessage(db, runner, input.from);
            const assignee = await resolveTaskAssignee(db, runner, input.assignee ?? 'me');
            const result = await startTask(db, agentActor(runner), agentDelivery, {
                assignee,
                ...(input.description === undefined ? {} : { description: input.description }),
                ...(input.dueOn === undefined ? {} : { dueOn: input.dueOn }),
                originChatId,
                originMessageId: origin.id,
                ...(input.priority === undefined ? {} : { priority: input.priority }),
                ...(input.project === undefined ? {} : { projectKey: input.project }),
                serverId: runner.serverId,
                state: input.state ?? 'open',
                title: input.title,
            });
            return {
                target: formatTaskTarget(result.task.key),
                task: await commit(runner, result),
            };
        }
    );

    agentTaskWrite(
        app,
        db,
        { body: agentTaskStateInputSchema, path: '/api/agent/tasks/state' },
        async (runner, input) => {
            const { serverId } = runner;
            const task: Task = await findTask(db, { key: input.key, serverId });
            const result = await withImplicitVersion(
                input.expectedVersion,
                async () => (await findTask(db, { key: input.key, serverId })).version,
                (expectedVersion) =>
                    setTaskState(db, agentActor(runner), {
                        expectedVersion,
                        serverId,
                        state: input.state,
                        taskId: task.id,
                    })
            );
            return { task: await commit(runner, result) };
        }
    );
}
