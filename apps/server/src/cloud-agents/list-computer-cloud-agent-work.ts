import type { CloudAgentReconcileEntry } from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentRunsTable, cloudAgentWorkTable } from '../postgres/schema.ts';

/**
 * Every non-terminal Run assigned to one Computer, including predecessors, and any
 * cancel request recorded while that Computer was offline. Reconnect pushes
 * this list down so the Computer reads each Run from the provider and reports
 * an observation: work that settled during the outage settles here too.
 */
export async function listComputerCloudAgentWork(
    db: Pick<HausDatabase, 'select'>,
    input: { computerId: string; serverId: string; workId?: string }
): Promise<CloudAgentReconcileEntry[]> {
    const rows = await db
        .select({
            cancelRequestedAt: cloudAgentWorkTable.cancelRequestedAt,
            workId: cloudAgentWorkTable.id,
            provider: cloudAgentWorkTable.provider,
            providerAgentId: cloudAgentWorkTable.providerAgentId,
            status: cloudAgentRunsTable.status,
            runId: cloudAgentRunsTable.id,
            providerRunId: cloudAgentRunsTable.providerRunId,
        })
        .from(cloudAgentWorkTable)
        .innerJoin(
            cloudAgentRunsTable,
            and(
                eq(cloudAgentRunsTable.serverId, cloudAgentWorkTable.serverId),
                eq(cloudAgentRunsTable.workId, cloudAgentWorkTable.id)
            )
        )
        .where(
            and(
                eq(cloudAgentWorkTable.serverId, input.serverId),
                eq(cloudAgentWorkTable.computerId, input.computerId),
                input.workId ? eq(cloudAgentWorkTable.id, input.workId) : undefined,
                inArray(cloudAgentRunsTable.status, ['queued', 'running', 'pending_input'])
            )
        )
        .orderBy(asc(cloudAgentRunsTable.createdAt));
    return rows.map(({ cancelRequestedAt, ...row }) => ({
        ...row,
        cancelRequested: cancelRequestedAt !== null,
    }));
}
