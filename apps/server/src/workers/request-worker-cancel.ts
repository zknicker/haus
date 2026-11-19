import {
    type WorkerStopCommand,
    type WorkerCancelRequestedBy,
    type Worker,
    isTerminalWorkerTurnStatus,
} from '@haus/api';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnsTable, workersTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { WorkerComputerRemovedError, WorkerNotFoundError, WorkerSettledError } from './errors.ts';
import { hasWorkerComputer } from './worker-computer.ts';
import { prepareWorkerEvents } from './worker-events.ts';
import { findWorker } from './worker-shape.ts';

export interface WorkerCancelRequest {
    /** One frame per live Run, to push at the assigned Computer once the record commits. */
    commands: WorkerStopCommand[];
    computerId: string;
    events: PreparedRealtimeEvent[];
    work: Worker;
}

/**
 * Records a cancellation on every live Run of the work and returns a frame for
 * each, for the Computer that holds the provider access. A Run settles as
 * `cancelled` through the ordinary observation path, so an offline Computer
 * simply keeps the recorded requests and applies them on reconnect. A repeated
 * request keeps each Run's first requester and re-sends the frames.
 */
export async function requestWorkerCancel(
    db: HausDatabase,
    input: {
        requestedBy: WorkerCancelRequestedBy;
        serverId: string;
        workId: string;
    }
): Promise<WorkerCancelRequest> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const [row] = await tx
            .select({
                computerId: workersTable.computerId,
                provider: workersTable.provider,
                providerAgentId: workersTable.providerAgentId,
            })
            .from(workersTable)
            .where(
                and(eq(workersTable.serverId, input.serverId), eq(workersTable.id, input.workId))
            )
            .limit(1);
        if (!row) {
            throw new WorkerNotFoundError();
        }
        const runs = await tx
            .select({
                cancelRequestedAt: workerTurnsTable.cancelRequestedAt,
                id: workerTurnsTable.id,
                providerRunId: workerTurnsTable.providerRunId,
                status: workerTurnsTable.status,
            })
            .from(workerTurnsTable)
            .where(
                and(
                    eq(workerTurnsTable.serverId, input.serverId),
                    eq(workerTurnsTable.workId, input.workId)
                )
            )
            .orderBy(desc(workerTurnsTable.createdAt));
        const live = runs.filter((run) => !isTerminalWorkerTurnStatus(run.status));
        if (live.length === 0) {
            throw new WorkerSettledError();
        }
        if (!(await hasWorkerComputer(tx, input.serverId, row.computerId))) {
            throw new WorkerComputerRemovedError();
        }

        const unrequested = live.filter((run) => !run.cancelRequestedAt).map((run) => run.id);
        if (unrequested.length > 0) {
            await tx
                .update(workerTurnsTable)
                .set({
                    cancelRequestedAt: sql`now()`,
                    cancelRequestedByAgentId:
                        input.requestedBy.kind === 'agent' ? input.requestedBy.id : null,
                    cancelRequestedByUserId:
                        input.requestedBy.kind === 'user' ? input.requestedBy.id : null,
                })
                .where(
                    and(
                        eq(workerTurnsTable.serverId, input.serverId),
                        inArray(workerTurnsTable.id, unrequested)
                    )
                );
            await tx
                .update(workersTable)
                .set({ updatedAt: sql`now()` })
                .where(
                    and(
                        eq(workersTable.serverId, input.serverId),
                        eq(workersTable.id, input.workId)
                    )
                );
        }

        const work = await findWorker(tx, input.serverId, input.workId);
        if (!work) {
            throw new WorkerNotFoundError();
        }
        return {
            commands: live.map((run) => ({
                provider: row.provider,
                providerAgentId: row.providerAgentId,
                providerRunId: run.providerRunId,
                runId: run.id,
                type: 'worker-stop',
                workId: input.workId,
            })),
            computerId: row.computerId,
            events: await prepareWorkerEvents(tx, {
                serverId: input.serverId,
                workId: input.workId,
            }),
            work,
        };
    });
}
