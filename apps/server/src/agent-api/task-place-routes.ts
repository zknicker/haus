import { agentTaskArchiveInputSchema, agentTaskStartInputSchema, formatTaskTarget } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { archiveTask } from '../tasks/task-archive.ts';
import { findTaskByRef } from '../tasks/task-list.ts';
import { startTask } from '../tasks/task-start.ts';
import type { TaskWriteResult } from '../tasks/task-write-result.ts';
import { resolveAgentMessage } from './message-read.ts';
import { resolveAgentTarget } from './resolve-target.ts';
import { agentActor } from './task-refs.ts';
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
            const result = await startTask(db, agentActor(runner), {
                ...(input.description === undefined ? {} : { description: input.description }),
                originChatId,
                originMessageId: origin.id,
                ...(input.project === undefined ? {} : { projectKey: input.project }),
                serverId: runner.serverId,
                title: input.title,
            });
            return {
                target: formatTaskTarget(result.task.shortId),
                task: await commit(runner, result),
            };
        }
    );

    agentTaskWrite(
        app,
        db,
        { body: agentTaskArchiveInputSchema, path: '/api/agent/tasks/archive' },
        async (runner, input) => {
            const { serverId } = runner;
            const task = await findTaskByRef(db, { ref: input.task, serverId });
            const result = await withImplicitVersion(
                input.expectedVersion,
                async () => (await findTaskByRef(db, { ref: input.task, serverId })).version,
                (expectedVersion) =>
                    archiveTask(db, agentActor(runner), agentDelivery, {
                        expectedVersion,
                        serverId,
                        taskId: task.id,
                    })
            );
            return { task: await commit(runner, result) };
        }
    );
}
