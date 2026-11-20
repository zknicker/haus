import type { WorkerReconcileEntry } from '@haus/api';
import { and, asc, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnsTable, workersTable } from '../postgres/schema.ts';

const carriedTurn = and(
    eq(workerTurnsTable.serverId, workersTable.serverId),
    eq(workerTurnsTable.workerId, workersTable.id)
);

export async function listComputerWorker(
    db: Pick<HausDatabase, 'select'>,
    input: { computerId: string; serverId: string }
): Promise<WorkerReconcileEntry[]> {
    const rows = await db
        .select({
            place: workersTable.place,
            providerAgentId: workersTable.providerAgentId,
            providerRunId: workerTurnsTable.providerRunId,
            status: workerTurnsTable.status,
            stopRequestedAt: workerTurnsTable.stopRequestedAt,
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
                    and(isNull(workerTurnsTable.input), isNull(workerTurnsTable.outcome))
                )
            )
        )
        .orderBy(asc(workerTurnsTable.createdAt), asc(workerTurnsTable.id));
    return rows.map(({ stopRequestedAt, ...row }) => ({
        ...row,
        stopRequested: stopRequestedAt !== null,
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
                isNull(workerTurnsTable.outcome)
            )
        )
        .orderBy(asc(workerTurnsTable.createdAt), asc(workerTurnsTable.id));
}
