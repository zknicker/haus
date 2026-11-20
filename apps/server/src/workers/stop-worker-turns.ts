import { type WorkerStopCommand, type WorkerStopRequestedBy, projectWorker } from '@haus/api';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentInboxTable,
    computersTable,
    workerTurnsTable,
    workersTable,
} from '../postgres/schema.ts';
import { WorkerClosedError, WorkerHistoryReadOnlyError, WorkerNotFoundError } from './errors.ts';
import { revokeTurnCredentials } from './worker-credentials.ts';
import { workerPlaceOf } from './worker-row-place.ts';

type WorkerRow = typeof workersTable.$inferSelect;

export async function lockWorker(tx: HausDatabase, serverId: string, workerId: string) {
    const [worker] = await tx
        .select()
        .from(workersTable)
        .where(and(eq(workersTable.serverId, serverId), eq(workersTable.id, workerId)))
        .for('update')
        .limit(1);
    if (!worker) {
        throw new WorkerNotFoundError();
    }
    if (!worker.taskId) {
        throw new WorkerHistoryReadOnlyError();
    }
    return worker;
}

export function requireOpenWorker(worker: WorkerRow) {
    if (worker.closingAt || worker.closedAt) {
        throw new WorkerClosedError();
    }
    return worker;
}

export async function stopWorkerTurns(
    tx: HausDatabase,
    input: { requestedBy: WorkerStopRequestedBy; worker: WorkerRow }
) {
    const { worker } = input;
    const live = await tx
        .select()
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
        return { frames: [], stoppedTurnIds: [], stopped: false };
    }
    const carrierOnline = await isCarrierOnline(tx, worker);
    await tx
        .update(workerTurnsTable)
        .set({
            stopRequestedAt: sql`now()`,
            stopRequestedByAgentId:
                input.requestedBy.kind === 'agent' ? input.requestedBy.id : null,
            stopRequestedByUserId: input.requestedBy.kind === 'user' ? input.requestedBy.id : null,
        })
        .where(
            and(
                eq(workerTurnsTable.serverId, worker.serverId),
                inArray(
                    workerTurnsTable.id,
                    live.filter((turn) => !turn.stopRequestedAt).map((turn) => turn.id)
                )
            )
        );
    const undispatched = live.filter((turn) => !turn.dispatchedAt).map((turn) => turn.id);
    const dispatched = live.filter((turn) => turn.dispatchedAt);
    await settleUnsentAsStopped(tx, worker, undispatched);
    const settledNow = carrierOnline ? [] : dispatched.map((turn) => turn.id);
    await settleStoppedOnServer(tx, worker, settledNow);
    await tx
        .update(workersTable)
        .set({ updatedAt: sql`now()` })
        .where(and(eq(workersTable.serverId, worker.serverId), eq(workersTable.id, worker.id)));
    const frames = carrierOnline ? dispatched.map((turn) => workerStopFrame(worker, turn)) : [];
    return { frames, stoppedTurnIds: [...undispatched, ...settledNow], stopped: true };
}

export function workerStopFrame(
    worker: WorkerRow,
    turn: { id: string; providerRunId: string | null }
) {
    return {
        computerId: worker.carrierComputerId,
        frame: {
            place: workerPlaceOf(worker),
            providerAgentId: worker.providerAgentId,
            providerRunId: turn.providerRunId,
            turnId: turn.id,
            type: 'worker-stop',
            workerId: worker.id,
        } satisfies WorkerStopCommand,
    };
}

async function settleUnsentAsStopped(tx: HausDatabase, worker: WorkerRow, turnIds: string[]) {
    if (turnIds.length === 0) {
        return;
    }
    await revokeTurnCredentials(tx, worker.serverId, turnIds);
    await tx
        .update(workerTurnsTable)
        .set({
            ...projectWorker({ startedAt: null, status: 'cancelled', terminalAt: new Date() }),
            outcome: { kind: 'stopped' },
            stallCode: null,
            stallSince: null,
        })
        .where(
            and(
                eq(workerTurnsTable.serverId, worker.serverId),
                inArray(workerTurnsTable.id, turnIds)
            )
        );
    await syncWorkerLifecycle(tx, worker.serverId, worker.id);
}

export async function syncWorkerLifecycle(tx: HausDatabase, serverId: string, workerId: string) {
    await tx.execute(sql`
        update workers set
            status = newest.status,
            started_at = newest.started_at,
            terminal_at = newest.terminal_at
        from (
            select status, started_at, terminal_at from worker_turns
            where server_id = ${serverId} and worker_id = ${workerId}
            order by created_at desc, id desc
            limit 1
        ) as newest
        where workers.server_id = ${serverId} and workers.id = ${workerId}
    `);
}

async function settleStoppedOnServer(tx: HausDatabase, worker: WorkerRow, turnIds: string[]) {
    if (turnIds.length === 0) {
        return;
    }
    await revokeTurnCredentials(tx, worker.serverId, turnIds);
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
}

export async function isCarrierOnline(tx: HausDatabase, worker: WorkerRow) {
    const [carrier] = await tx
        .select({ health: computersTable.health })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.serverId, worker.serverId),
                eq(computersTable.id, worker.carrierComputerId)
            )
        )
        .limit(1);
    return carrier?.health === 'healthy' || carrier?.health === 'degraded';
}
