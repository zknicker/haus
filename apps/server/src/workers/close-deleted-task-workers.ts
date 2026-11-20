import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable, workerTurnsTable, workersTable } from '../postgres/schema.ts';
import { isCarrierOnline, workerStopFrame } from './stop-worker-turns.ts';
import type { WorkerFrame } from './worker-effects.ts';

export async function closeDeletedTaskWorkers(
    tx: HausDatabase,
    input: { serverId: string; taskIds: readonly string[] }
) {
    const workers = await tx
        .select()
        .from(workersTable)
        .where(
            and(
                eq(workersTable.serverId, input.serverId),
                inArray(workersTable.taskId, [...input.taskIds])
            )
        );
    const frames: WorkerFrame[] = [];
    for (const worker of workers) {
        const live = await tx
            .select({
                dispatchedAt: workerTurnsTable.dispatchedAt,
                id: workerTurnsTable.id,
                providerRunId: workerTurnsTable.providerRunId,
            })
            .from(workerTurnsTable)
            .where(
                and(
                    eq(workerTurnsTable.serverId, worker.serverId),
                    eq(workerTurnsTable.workerId, worker.id),
                    isNull(workerTurnsTable.outcome)
                )
            )
            .orderBy(asc(workerTurnsTable.createdAt), asc(workerTurnsTable.id));
        if (live.length === 0) {
            continue;
        }
        const turnIds = live.map((turn) => turn.id);
        await tx
            .update(workerTurnsTable)
            .set({ outcome: { kind: 'stopped' }, stallCode: null, stallSince: null })
            .where(
                and(
                    eq(workerTurnsTable.serverId, worker.serverId),
                    inArray(workerTurnsTable.id, turnIds)
                )
            );
        await tx
            .delete(agentInboxTable)
            .where(
                and(
                    eq(agentInboxTable.serverId, worker.serverId),
                    inArray(agentInboxTable.workerTurnId, turnIds),
                    eq(agentInboxTable.source, 'worker_stall'),
                    eq(agentInboxTable.state, 'queued')
                )
            );
        if (await isCarrierOnline(tx, worker)) {
            frames.push(
                ...live
                    .filter((turn) => turn.dispatchedAt)
                    .map((turn) => workerStopFrame(worker, turn))
            );
        }
    }
    await tx
        .update(workersTable)
        .set({
            closedAt: sql`coalesce(${workersTable.closedAt}, now())`,
            closingAt: sql`coalesce(${workersTable.closingAt}, now())`,
            taskId: null,
            updatedAt: sql`now()`,
        })
        .where(
            and(
                eq(workersTable.serverId, input.serverId),
                inArray(workersTable.taskId, [...input.taskIds])
            )
        );
    return frames;
}
