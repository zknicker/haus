import {
    type CloudAgentCancelCommand,
    type CloudAgentCancelRequestedBy,
    type CloudAgentWork,
    isTerminalCloudAgentStatus,
} from '@haus/api';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    cloudAgentInputTable,
    cloudAgentRunsTable,
    cloudAgentWorkTable,
} from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { prepareCloudAgentWorkEvents } from './cloud-agent-events.ts';
import { findCloudAgentWork } from './cloud-agent-shape.ts';
import { hasCloudAgentWorkComputer } from './cloud-agent-work-computer.ts';
import {
    CloudAgentCancelDeniedError,
    CloudAgentCancelUnsupportedError,
    CloudAgentComputerRemovedError,
    CloudAgentWorkNotFoundError,
    CloudAgentWorkSettledError,
} from './errors.ts';

export interface CloudAgentCancelRequest {
    /** The frame to push at the assigned Computer once the record commits. */
    command: CloudAgentCancelCommand;
    computerId: string;
    events: PreparedRealtimeEvent[];
    work: CloudAgentWork;
}

/**
 * Records one cancellation request and returns the frame for the Computer that
 * holds the provider access. The Run settles as `cancelled` through the
 * ordinary observation path, so an offline Computer simply keeps the recorded
 * request and applies it on reconnect. A repeated request keeps the first
 * requester and re-sends the frame.
 */
export async function requestCloudAgentCancel(
    db: HausDatabase,
    input: {
        requestedBy: CloudAgentCancelRequestedBy;
        serverId: string;
        workId: string;
    }
): Promise<CloudAgentCancelRequest> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const [row] = await tx
            .select({
                computerId: cloudAgentWorkTable.computerId,
                cancelRequestedAt: cloudAgentWorkTable.cancelRequestedAt,
                provider: cloudAgentWorkTable.provider,
                providerAgentId: cloudAgentWorkTable.providerAgentId,
                status: cloudAgentWorkTable.status,
                agentId: cloudAgentWorkTable.agentId,
            })
            .from(cloudAgentWorkTable)
            .where(
                and(
                    eq(cloudAgentWorkTable.serverId, input.serverId),
                    eq(cloudAgentWorkTable.id, input.workId)
                )
            )
            .limit(1);
        if (!row) {
            throw new CloudAgentWorkNotFoundError();
        }
        requireCancelAuthority(row, input.requestedBy);
        if (isTerminalCloudAgentStatus(row.status)) {
            throw new CloudAgentWorkSettledError();
        }
        if (!(await hasCloudAgentWorkComputer(tx, input.serverId, row.computerId))) {
            throw new CloudAgentComputerRemovedError();
        }
        const [run] = await tx
            .select({
                id: cloudAgentRunsTable.id,
                providerRunId: cloudAgentRunsTable.providerRunId,
            })
            .from(cloudAgentRunsTable)
            .where(
                and(
                    eq(cloudAgentRunsTable.serverId, input.serverId),
                    eq(cloudAgentRunsTable.workId, input.workId)
                )
            )
            .orderBy(desc(cloudAgentRunsTable.createdAt))
            .limit(1);
        if (!run) {
            throw new CloudAgentWorkNotFoundError();
        }

        if (!row.cancelRequestedAt) {
            await tx
                .update(cloudAgentWorkTable)
                .set({
                    cancelRequestedAt: sql`now()`,
                    cancelRequestedByAgentId:
                        input.requestedBy.kind === 'agent' ? input.requestedBy.id : null,
                    cancelRequestedByUserId:
                        input.requestedBy.kind === 'user' ? input.requestedBy.id : null,
                    updatedAt: sql`now()`,
                })
                .where(
                    and(
                        eq(cloudAgentWorkTable.serverId, input.serverId),
                        eq(cloudAgentWorkTable.id, input.workId)
                    )
                );
        }
        await invalidateClaudeInput(tx, input, row);

        const work = await findCloudAgentWork(tx, input.serverId, input.workId);
        if (!work) {
            throw new CloudAgentWorkNotFoundError();
        }
        return {
            command: {
                provider: row.provider,
                providerAgentId: row.providerAgentId,
                providerRunId: run.providerRunId,
                runId: run.id,
                type: 'cloud-agent-cancel',
                workId: input.workId,
            },
            computerId: row.computerId,
            events: await prepareCloudAgentWorkEvents(tx, {
                serverId: input.serverId,
                workId: input.workId,
            }),
            work,
        };
    });
}

function requireCancelAuthority(
    work: Pick<typeof cloudAgentWorkTable.$inferSelect, 'provider' | 'agentId'>,
    requestedBy: CloudAgentCancelRequestedBy
) {
    if (work.provider === 'claude' && requestedBy.kind !== 'agent') {
        throw new CloudAgentCancelUnsupportedError();
    }
    if (requestedBy.kind === 'agent' && requestedBy.id !== work.agentId) {
        throw new CloudAgentCancelDeniedError();
    }
}
async function invalidateClaudeInput(
    db: HausDatabase,
    input: { serverId: string; workId: string },
    work: Pick<typeof cloudAgentWorkTable.$inferSelect, 'provider' | 'status'>
) {
    if (work.provider === 'claude') {
        const runs = await db
            .select({ id: cloudAgentRunsTable.id })
            .from(cloudAgentRunsTable)
            .where(
                and(
                    eq(cloudAgentRunsTable.serverId, input.serverId),
                    eq(cloudAgentRunsTable.workId, input.workId)
                )
            );
        await db
            .update(cloudAgentInputTable)
            .set({ state: 'cancelled' })
            .where(
                and(
                    eq(cloudAgentInputTable.serverId, input.serverId),
                    inArray(
                        cloudAgentInputTable.runId,
                        runs.map((entry) => entry.id)
                    ),
                    inArray(cloudAgentInputTable.state, ['pending', 'answered'])
                )
            );
        await db
            .update(cloudAgentRunsTable)
            .set({ status: 'running' })
            .where(
                and(
                    eq(cloudAgentRunsTable.serverId, input.serverId),
                    eq(cloudAgentRunsTable.workId, input.workId),
                    eq(cloudAgentRunsTable.status, 'pending_input')
                )
            );
        if (work.status === 'pending_input') {
            await db
                .update(cloudAgentWorkTable)
                .set({ status: 'running' })
                .where(eq(cloudAgentWorkTable.id, input.workId));
        }
    }
}
