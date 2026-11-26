import {
    agentTaskArchiveInputSchema,
    agentTaskStartInputSchema,
    formatTaskTarget,
} from '@haus/api';
import type { FastifyInstance } from 'fastify';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { AgentModelCatalog } from '../server-agents/agent-model-catalog.ts';
import { archiveTask, unarchiveTask } from '../tasks/task-archive.ts';
import { findTaskByRef } from '../tasks/task-list.ts';
import { startCrewTask } from '../tasks/task-start.ts';
import type { TaskWriteResult } from '../tasks/task-write-result.ts';
import { resolveAgentMessage } from './message-read.ts';
import { resolveAgentTarget } from './resolve-target.ts';
import { readFreshnessHold } from './send-hold.ts';
import { agentActor } from './task-refs.ts';
import { agentTaskWrite, withImplicitVersion } from './task-route-shell.ts';

export function registerAgentTaskPlaceRoutes(
    app: FastifyInstance,
    options: {
        agentDelivery: AgentDelivery;
        catalog: AgentModelCatalog;
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
            const targetChatId = input.target
                ? await resolveAgentTarget(db, runner, input.target)
                : null;
            const origin =
                input.from && targetChatId
                    ? {
                          chatId: targetChatId,
                          messageId: (await resolveAgentMessage(db, runner, input.from)).id,
                      }
                    : null;
            const started = await startCrewTask(
                db,
                { agentDelivery, catalog: options.catalog },
                {
                    brief: input.brief,
                    captainId: runner.agentId,
                    hold: (tx, chatId) => readFreshnessHold(tx, runner, chatId),
                    ...(input.issue === undefined ? {} : { issue: input.issue }),
                    ...(input.machine === undefined ? {} : { machine: input.machine }),
                    ...(input.model === undefined ? {} : { model: input.model }),
                    origin,
                    ...(input.repo === undefined
                        ? {}
                        : { repo: { name: input.repo, ref: input.ref ?? null } }),
                    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
                    runId: runner.runId,
                    serverId: runner.serverId,
                    targetChatId,
                    ...(input.title === undefined ? {} : { title: input.title }),
                }
            );
            if (started.kind === 'held') {
                return { ...started.held, state: 'held' };
            }
            return {
                state: 'started',
                target: formatTaskTarget(started.result.task.shortId),
                task: await commit(runner, started.result),
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

    agentTaskWrite(
        app,
        db,
        { body: agentTaskArchiveInputSchema, path: '/api/agent/tasks/unarchive' },
        async (runner, input) => {
            const { serverId } = runner;
            const task = await findTaskByRef(db, { ref: input.task, serverId });
            const result = await unarchiveTask(db, agentActor(runner), {
                expectedVersion: input.expectedVersion ?? task.version,
                serverId,
                taskId: task.id,
            });
            return { task: await commit(runner, result) };
        }
    );
}
