import {
    type CloudAgentCancelCommand,
    type CloudAgentCancelRequestedBy,
    type CloudAgentWork,
    isTerminalCloudAgentStatus,
} from '@haus/api';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentRunsTable, cloudAgentWorkTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { prepareCloudAgentWorkEvents } from './cloud-agent-events.ts';
import { findCloudAgentWork } from './cloud-agent-shape.ts';
import { hasCloudAgentWorkComputer } from './cloud-agent-work-computer.ts';
import {
    CloudAgentComputerRemovedError,
    CloudAgentWorkNotFoundError,
    CloudAgentWorkSettledError,
} from './errors.ts';

export interface CloudAgentCancelRequest {
    /** One frame per live Run, to push at the assigned Computer once the record commits. */
    commands: CloudAgentCancelCommand[];
    computerId: string;
    events: PreparedRealtimeEvent[];
    work: CloudAgentWork;
}

/**
 * Records a cancellation on every live Run of the work and returns a frame for
 * each, for the Computer that holds the provider access. A Run settles as
 * `cancelled` through the ordinary observation path, so an offline Computer
 * simply keeps the recorded requests and applies them on reconnect. A repeated
 * request keeps each Run's first requester and re-sends the frames.
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
                provider: cloudAgentWorkTable.provider,
                providerAgentId: cloudAgentWorkTable.providerAgentId,
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
        const runs = await tx
            .select({
                cancelRequestedAt: cloudAgentRunsTable.cancelRequestedAt,
                id: cloudAgentRunsTable.id,
                providerRunId: cloudAgentRunsTable.providerRunId,
                status: cloudAgentRunsTable.status,
            })
            .from(cloudAgentRunsTable)
            .where(
                and(
                    eq(cloudAgentRunsTable.serverId, input.serverId),
                    eq(cloudAgentRunsTable.workId, input.workId)
                )
            )
            .orderBy(desc(cloudAgentRunsTable.createdAt));
        const live = runs.filter((run) => !isTerminalCloudAgentStatus(run.status));
        if (live.length === 0) {
            throw new CloudAgentWorkSettledError();
        }
        if (!(await hasCloudAgentWorkComputer(tx, input.serverId, row.computerId))) {
            throw new CloudAgentComputerRemovedError();
        }

        const unrequested = live.filter((run) => !run.cancelRequestedAt).map((run) => run.id);
        if (unrequested.length > 0) {
            await tx
                .update(cloudAgentRunsTable)
                .set({
                    cancelRequestedAt: sql`now()`,
                    cancelRequestedByAgentId:
                        input.requestedBy.kind === 'agent' ? input.requestedBy.id : null,
                    cancelRequestedByUserId:
                        input.requestedBy.kind === 'user' ? input.requestedBy.id : null,
                })
                .where(
                    and(
                        eq(cloudAgentRunsTable.serverId, input.serverId),
                        inArray(cloudAgentRunsTable.id, unrequested)
                    )
                );
            await tx
                .update(cloudAgentWorkTable)
                .set({ updatedAt: sql`now()` })
                .where(
                    and(
                        eq(cloudAgentWorkTable.serverId, input.serverId),
                        eq(cloudAgentWorkTable.id, input.workId)
                    )
                );
        }

        const work = await findCloudAgentWork(tx, input.serverId, input.workId);
        if (!work) {
            throw new CloudAgentWorkNotFoundError();
        }
        return {
            commands: live.map((run) => ({
                provider: row.provider,
                providerAgentId: row.providerAgentId,
                providerRunId: run.providerRunId,
                runId: run.id,
                type: 'cloud-agent-cancel',
                workId: input.workId,
            })),
            computerId: row.computerId,
            events: await prepareCloudAgentWorkEvents(tx, {
                serverId: input.serverId,
                workId: input.workId,
            }),
            work,
        };
    });
}
