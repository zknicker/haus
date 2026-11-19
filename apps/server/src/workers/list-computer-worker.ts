import type { WorkerReconcileEntry } from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnsTable, workersTable } from '../postgres/schema.ts';

/**
 * Every non-terminal Run assigned to one Computer, including predecessors, and any
 * cancel request recorded while that Computer was offline. Reconnect pushes
 * this list down so the Computer reads each Run from the provider and reports
 * an observation: work that settled during the outage settles here too.
 */
export async function listComputerWorker(
    db: Pick<HausDatabase, 'select'>,
    input: { computerId: string; serverId: string; workId?: string }
): Promise<WorkerReconcileEntry[]> {
    const rows = await db
        .select({
            cancelRequestedAt: workerTurnsTable.cancelRequestedAt,
            workId: workersTable.id,
            provider: workersTable.provider,
            providerAgentId: workersTable.providerAgentId,
            status: workerTurnsTable.status,
            runId: workerTurnsTable.id,
            providerRunId: workerTurnsTable.providerRunId,
        })
        .from(workersTable)
        .innerJoin(
            workerTurnsTable,
            and(
                eq(workerTurnsTable.serverId, workersTable.serverId),
                eq(workerTurnsTable.workId, workersTable.id)
            )
        )
        .where(
            and(
                eq(workersTable.serverId, input.serverId),
                eq(workersTable.computerId, input.computerId),
                input.workId ? eq(workersTable.id, input.workId) : undefined,
                inArray(workerTurnsTable.status, ['queued', 'running'])
            )
        )
        .orderBy(asc(workerTurnsTable.createdAt));
    return rows.map(({ cancelRequestedAt, ...row }) => ({
        ...row,
        cancelRequested: cancelRequestedAt !== null,
    }));
}
