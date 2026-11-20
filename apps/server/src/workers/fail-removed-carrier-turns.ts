import { and, asc, eq, isNull } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnsTable, workersTable } from '../postgres/schema.ts';
import { withDispatch } from './dispatch-worker-turns.ts';
import { settleWorkerTurnAsFailed } from './settle-worker-turn.ts';

export async function failRemovedCarrierTurns(
    tx: HausDatabase,
    agentDelivery: AgentDelivery,
    storage: ArtifactStorage | null,
    input: { computerId: string; serverId: string }
) {
    const unsettled = await tx
        .select({ turnId: workerTurnsTable.id, worker: workersTable })
        .from(workerTurnsTable)
        .innerJoin(
            workersTable,
            and(
                eq(workersTable.serverId, workerTurnsTable.serverId),
                eq(workersTable.id, workerTurnsTable.workerId)
            )
        )
        .where(
            and(
                eq(workersTable.serverId, input.serverId),
                eq(workersTable.carrierComputerId, input.computerId),
                isNull(workerTurnsTable.outcome)
            )
        )
        .orderBy(asc(workerTurnsTable.createdAt), asc(workerTurnsTable.id));
    const wakes: Array<{ agentId: string; serverId: string }> = [];
    for (const { turnId, worker } of unsettled) {
        const delivered = await settleWorkerTurnAsFailed(tx, agentDelivery, {
            reason: 'machine-removed',
            turnId,
            worker,
        });
        if (delivered) {
            wakes.push(delivered);
        }
    }
    return await withDispatch(tx, storage, input.serverId, {
        events: [],
        frames: [],
        wakes,
        workerIds: [...new Set(unsettled.map(({ worker }) => worker.id))],
    });
}
