import { createHash } from 'node:crypto';
import { type AgentWorkerSendInput, type AgentWorkerSendReceipt, projectWorker } from '@haus/api';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, workerTurnsTable, workersTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { resolveRunModel } from './cloud-agent-model.ts';
import {
    WorkerComputerRemovedError,
    WorkerNotLaunchedError,
    WorkerNotFoundError,
} from './errors.ts';
import { listComputerWorker } from './list-computer-worker.ts';
import { hasWorkerComputer } from './worker-computer.ts';
import { prepareWorkerEvents } from './worker-events.ts';
import { findWorker } from './worker-shape.ts';

export async function sendWorker(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentWorkerSendInput
): Promise<{ receipt: AgentWorkerSendReceipt; events: PreparedRealtimeEvent[] }> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const [row] = await tx
            .select({ work: workersTable })
            .from(workersTable)
            .innerJoin(
                agentsTable,
                and(
                    eq(agentsTable.serverId, workersTable.serverId),
                    eq(agentsTable.id, workersTable.agentId)
                )
            )
            .where(
                and(
                    eq(workersTable.serverId, runner.serverId),
                    eq(workersTable.id, input.workerId),
                    eq(workersTable.agentId, runner.agentId),
                    eq(workersTable.computerId, runner.computerId),
                    eq(agentsTable.computerId, runner.computerId)
                )
            )
            .limit(1);
        if (!row) {
            const [own] = await tx
                .select({ computerId: workersTable.computerId })
                .from(workersTable)
                .where(
                    and(
                        eq(workersTable.serverId, runner.serverId),
                        eq(workersTable.id, input.workerId),
                        eq(workersTable.agentId, runner.agentId)
                    )
                )
                .limit(1);
            if (own && !(await hasWorkerComputer(tx, runner.serverId, own.computerId))) {
                throw new WorkerComputerRemovedError();
            }
            throw new WorkerNotFoundError();
        }
        if (!row.work.providerAgentId) {
            throw new WorkerNotLaunchedError();
        }
        const turnId = `car_${createHash('sha256')
            .update(JSON.stringify([runner.serverId, input.workerId, input.nonce]))
            .digest('base64url')
            .slice(0, 16)}`;
        const [existing] = await tx
            .select()
            .from(workerTurnsTable)
            .where(
                and(eq(workerTurnsTable.serverId, runner.serverId), eq(workerTurnsTable.id, turnId))
            )
            .limit(1);
        let events: PreparedRealtimeEvent[] = [];
        if (!existing) {
            const model = await resolveRunModel(tx, {
                computerId: runner.computerId,
                provider: row.work.provider,
                serverId: runner.serverId,
            });
            await tx.insert(workerTurnsTable).values({
                id: turnId,
                modelDroppedParams: model.droppedParams,
                modelFallbackFrom: model.fallbackFrom,
                modelId: model.id,
                modelParams: model.params,
                serverId: runner.serverId,
                workerId: input.workerId,
                createdAt: sql`greatest(clock_timestamp(), (select max(created_at) + interval '1 millisecond' from cloud_agent_runs where server_id = ${runner.serverId} and work_id = ${input.workerId}))`,
            });
            await tx
                .update(workersTable)
                .set({
                    ...projectWorker({
                        startedAt: null,
                        status: 'queued',
                        terminalAt: null,
                    }),
                    activityAt: null,
                    activitySummary: null,
                    updatedAt: sql`clock_timestamp()`,
                })
                .where(
                    and(
                        eq(workersTable.serverId, runner.serverId),
                        eq(workersTable.id, input.workerId)
                    )
                );
            events = await prepareWorkerEvents(tx, {
                serverId: runner.serverId,
                workerId: input.workerId,
            });
        }
        const predecessors = await listComputerWorker(tx, {
            computerId: runner.computerId,
            serverId: runner.serverId,
            workerId: input.workerId,
        });
        const earlier = existing
            ? await tx
                  .select({ id: workerTurnsTable.id })
                  .from(workerTurnsTable)
                  .where(
                      and(
                          eq(workerTurnsTable.serverId, runner.serverId),
                          eq(workerTurnsTable.workerId, input.workerId),
                          lt(workerTurnsTable.createdAt, existing.createdAt)
                      )
                  )
            : null;
        const earlierIds = earlier ? new Set(earlier.map((run) => run.id)) : null;
        const work = await findWorker(tx, runner.serverId, input.workerId);
        if (!work) {
            throw new WorkerNotFoundError();
        }
        return {
            events,
            receipt: {
                worker: work,
                turnId,
                idempotent: Boolean(existing),
                predecessors: predecessors.filter(
                    (run) => run.turnId !== turnId && (!earlierIds || earlierIds.has(run.turnId))
                ),
            },
        };
    });
}
