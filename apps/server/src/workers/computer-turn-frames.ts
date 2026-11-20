import {
    type WorkerHeldFrame,
    type WorkerTurnActivityFrame,
    type WorkerTurnInputAcceptedFrame,
    type WorkerTurnSessionFrame,
    projectWorker,
} from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnsTable, workersTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { heldWorkerCloseFrames } from './worker-close-frames.ts';
import type { WorkerEffects } from './worker-effects.ts';
import { prepareWorkerEvents } from './worker-events.ts';
import { syncWorkerLifecycle } from './worker-lifecycle.ts';
import { currentTurnAttempt } from './worker-turn-attempt.ts';

interface FrameScope {
    computerId: string;
    serverId: string;
}

const activityCadenceMs = 5000;

export async function acceptComputerTurnInput(
    db: HausDatabase,
    scope: FrameScope,
    frame: WorkerTurnInputAcceptedFrame
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, scope.serverId);
        const row = await readCarriedTurn(tx, scope, frame.turnId);
        if (!row || row.turn.outcome || currentTurnAttempt(row.turn) !== frame.attempt) {
            return null;
        }
        const { turn, worker } = row;
        await tx
            .update(workerTurnsTable)
            .set(
                projectWorker({
                    startedAt: turn.startedAt ?? new Date(),
                    status: 'running',
                    terminalAt: null,
                })
            )
            .where(
                and(eq(workerTurnsTable.serverId, turn.serverId), eq(workerTurnsTable.id, turn.id))
            );
        await syncWorkerLifecycle(tx, worker.serverId, worker.id);
        if (turn.workerMdRevisionId && turn.workerMdRevisionId === frame.workerMdRevisionId) {
            await tx
                .update(workersTable)
                .set({ workerMdRevisionId: turn.workerMdRevisionId })
                .where(
                    and(eq(workersTable.serverId, worker.serverId), eq(workersTable.id, worker.id))
                );
        }
        return await touched(tx, scope.serverId, worker.id);
    });
}

export async function recordComputerTurnSession(
    db: HausDatabase,
    scope: FrameScope,
    frame: WorkerTurnSessionFrame
) {
    const row = await readCarriedTurn(db, scope, frame.turnId);
    if (!row) {
        return null;
    }
    const stored = await db
        .update(workersTable)
        .set({ nativeSessionId: frame.sessionId })
        .where(
            and(
                eq(workersTable.serverId, row.worker.serverId),
                eq(workersTable.id, row.worker.id),
                isNull(workersTable.nativeSessionId)
            )
        )
        .returning({ id: workersTable.id });
    return stored.length > 0 ? await touched(db, scope.serverId, row.worker.id) : null;
}

export async function recordComputerTurnActivity(
    db: HausDatabase,
    scope: FrameScope,
    frame: WorkerTurnActivityFrame
) {
    const row = await readCarriedTurn(db, scope, frame.turnId);
    if (!row || row.turn.outcome) {
        return null;
    }
    const at = new Date(frame.at);
    const updated = await db
        .update(workersTable)
        .set({ activityAt: at, activitySummary: frame.summary, updatedAt: sql`now()` })
        .where(
            and(
                eq(workersTable.serverId, row.worker.serverId),
                eq(workersTable.id, row.worker.id),
                sql`(${workersTable.activityAt} is null or ${workersTable.activityAt} <= ${new Date(at.getTime() - activityCadenceMs)})`
            )
        )
        .returning({ id: workersTable.id });
    return updated.length > 0 ? await touched(db, scope.serverId, row.worker.id) : null;
}

export async function answerHeldWorkers(
    db: HausDatabase,
    scope: FrameScope,
    frame: WorkerHeldFrame
) {
    return {
        events: [],
        frames: await heldWorkerCloseFrames(
            db,
            { id: scope.computerId, serverId: scope.serverId },
            frame.workerIds
        ),
        wakes: [],
    } satisfies WorkerEffects;
}

async function readCarriedTurn(
    db: Pick<HausDatabase, 'select'>,
    scope: FrameScope,
    turnId: string
) {
    const [row] = await db
        .select({ turn: workerTurnsTable, worker: workersTable })
        .from(workerTurnsTable)
        .innerJoin(
            workersTable,
            and(
                eq(workersTable.serverId, workerTurnsTable.serverId),
                eq(workersTable.id, workerTurnsTable.workerId)
            )
        )
        .where(and(eq(workerTurnsTable.serverId, scope.serverId), eq(workerTurnsTable.id, turnId)))
        .limit(1);
    return row?.worker.carrierComputerId === scope.computerId && row.worker.place === 'computer'
        ? row
        : null;
}

async function touched(db: Pick<HausDatabase, 'select'>, serverId: string, workerId: string) {
    return {
        events: await prepareWorkerEvents(db, { serverId, workerIds: [workerId] }),
        frames: [],
        wakes: [],
    } satisfies WorkerEffects;
}
