import { type WorkerTurnInput, projectWorker, requireCloudWorkerPlace } from '@haus/api';
import { and, arrayContains, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { computersTable, workerTurnsTable, workersTable } from '../postgres/schema.ts';
import { resolveRunModel } from './cloud-agent-model.ts';
import { WorkerCarrierRemovedError } from './errors.ts';
import { requireOpenWorker, stopWorkerTurns } from './stop-worker-turns.ts';
import type { WorkerFrame } from './worker-effects.ts';
import { workerPlaceOf } from './worker-row-place.ts';

type WorkerRow = typeof workersTable.$inferSelect;

export async function queueWorkerFollowUp(
    tx: HausDatabase,
    input: {
        followUp: WorkerTurnInput;
        interrupt: boolean;
        nonce: string | null;
        worker: WorkerRow;
    }
) {
    const worker = requireOpenWorker(input.worker);
    const replayed = input.nonce ? await findTurnByNonce(tx, worker, input.nonce) : null;
    if (replayed) {
        return { frames: [] as WorkerFrame[], idempotent: true, turnId: replayed };
    }
    await requireCarrier(tx, worker);
    const stopped = input.interrupt
        ? await stopWorkerTurns(tx, { requestedBy: input.followUp.author, worker })
        : { frames: [] };
    const nonces = input.nonce ? [input.nonce] : [];
    const waiting = await findWaitingTurn(tx, worker);
    if (waiting) {
        await tx
            .update(workerTurnsTable)
            .set({
                followUpNonces: [...waiting.followUpNonces, ...nonces],
                input: [...(waiting.input ?? []), input.followUp],
            })
            .where(
                and(
                    eq(workerTurnsTable.serverId, worker.serverId),
                    eq(workerTurnsTable.id, waiting.id)
                )
            );
        await touchWorker(tx, worker);
        return { frames: stopped.frames, idempotent: false, turnId: waiting.id };
    }
    const model = await resolveRunModel(tx, {
        computerId: worker.carrierComputerId,
        provider: requireCloudWorkerPlace(workerPlaceOf(worker)),
        serverId: worker.serverId,
    });
    const turnId = createOpaqueId('wkt');
    await tx.insert(workerTurnsTable).values({
        createdAt: sql`greatest(clock_timestamp(), (select max(created_at) + interval '1 millisecond' from worker_turns where server_id = ${worker.serverId} and worker_id = ${worker.id}))`,
        followUpNonces: nonces,
        id: turnId,
        input: [input.followUp],
        modelDroppedParams: model.droppedParams,
        modelFallbackFrom: model.fallbackFrom,
        modelId: model.id,
        modelParams: model.params,
        serverId: worker.serverId,
        workerId: worker.id,
    });
    await tx
        .update(workersTable)
        .set({
            ...projectWorker({ startedAt: null, status: 'queued', terminalAt: null }),
            activityAt: null,
            activitySummary: null,
            updatedAt: sql`now()`,
        })
        .where(and(eq(workersTable.serverId, worker.serverId), eq(workersTable.id, worker.id)));
    return { frames: stopped.frames, idempotent: false, turnId };
}

async function findTurnByNonce(tx: HausDatabase, worker: WorkerRow, nonce: string) {
    const [turn] = await tx
        .select({ id: workerTurnsTable.id })
        .from(workerTurnsTable)
        .where(
            and(
                eq(workerTurnsTable.serverId, worker.serverId),
                eq(workerTurnsTable.workerId, worker.id),
                arrayContains(workerTurnsTable.followUpNonces, [nonce])
            )
        )
        .limit(1);
    return turn?.id ?? null;
}

async function findWaitingTurn(tx: HausDatabase, worker: WorkerRow) {
    const [turn] = await tx
        .select({
            followUpNonces: workerTurnsTable.followUpNonces,
            id: workerTurnsTable.id,
            input: workerTurnsTable.input,
        })
        .from(workerTurnsTable)
        .where(
            and(
                eq(workerTurnsTable.serverId, worker.serverId),
                eq(workerTurnsTable.workerId, worker.id),
                isNull(workerTurnsTable.dispatchedAt),
                isNull(workerTurnsTable.outcome),
                isNotNull(workerTurnsTable.input)
            )
        )
        .orderBy(asc(workerTurnsTable.createdAt))
        .limit(1);
    return turn ?? null;
}

async function requireCarrier(tx: HausDatabase, worker: WorkerRow) {
    const [carrier] = await tx
        .select({ id: computersTable.id })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.serverId, worker.serverId),
                eq(computersTable.id, worker.carrierComputerId)
            )
        )
        .limit(1);
    if (!carrier) {
        throw new WorkerCarrierRemovedError();
    }
}

async function touchWorker(tx: HausDatabase, worker: WorkerRow) {
    await tx
        .update(workersTable)
        .set({ updatedAt: sql`now()` })
        .where(and(eq(workersTable.serverId, worker.serverId), eq(workersTable.id, worker.id)));
}
