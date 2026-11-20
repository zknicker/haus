import type { WorkerReconcileEntry } from '@haus/api';
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnsTable, workersTable } from '../postgres/schema.ts';
import { workerPlaceOf } from './worker-row-place.ts';

const carriedTurn = and(
    eq(workerTurnsTable.serverId, workersTable.serverId),
    eq(workerTurnsTable.workerId, workersTable.id)
);
const stopPending = sql<boolean>`(${workerTurnsTable.stopRequestedAt} is not null or coalesce(${workerTurnsTable.outcome} ->> 'kind' = 'stopped', false))`;

export async function listComputerWorker(
    db: Pick<HausDatabase, 'select'>,
    input: { computerId: string; serverId: string }
): Promise<WorkerReconcileEntry[]> {
    const rows = await db
        .select({
            carrierComputerId: workersTable.carrierComputerId,
            place: workersTable.place,
            providerAgentId: workersTable.providerAgentId,
            providerRunId: workerTurnsTable.providerRunId,
            status: workerTurnsTable.status,
            stopRequested: stopPending,
            turnId: workerTurnsTable.id,
            workerId: workersTable.id,
        })
        .from(workersTable)
        .innerJoin(workerTurnsTable, carriedTurn)
        .where(
            and(
                eq(workersTable.serverId, input.serverId),
                eq(workersTable.carrierComputerId, input.computerId),
                inArray(workerTurnsTable.status, ['queued', 'running']),
                or(
                    isNotNull(workerTurnsTable.acknowledgedAt),
                    and(isNull(workerTurnsTable.input), isNull(workerTurnsTable.outcome)),
                    and(isNotNull(workerTurnsTable.dispatchedAt), stopPending)
                )
            )
        )
        .orderBy(asc(workerTurnsTable.createdAt), asc(workerTurnsTable.id));
    return rows.map(({ carrierComputerId, place, ...entry }) => ({
        ...entry,
        place: workerPlaceOf({ carrierComputerId, place }),
    }));
}

export async function listUnacknowledgedTurns(
    db: Pick<HausDatabase, 'select'>,
    input: { computerId: string; serverId: string }
) {
    return await db
        .select({ turn: workerTurnsTable, worker: workersTable })
        .from(workersTable)
        .innerJoin(workerTurnsTable, carriedTurn)
        .where(
            and(
                eq(workersTable.serverId, input.serverId),
                eq(workersTable.carrierComputerId, input.computerId),
                isNotNull(workerTurnsTable.dispatchedAt),
                isNull(workerTurnsTable.acknowledgedAt),
                isNull(workerTurnsTable.outcome),
                isNull(workerTurnsTable.stopRequestedAt)
            )
        )
        .orderBy(asc(workerTurnsTable.createdAt), asc(workerTurnsTable.id));
}
