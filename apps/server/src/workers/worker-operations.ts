import type { AgentWorkerSendInput, WorkerStopRequestedBy } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { workersTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { withDispatch } from './dispatch-worker-turns.ts';
import { WorkerNotFoundError, WorkerNotLiveError, WorkerStopDeniedError } from './errors.ts';
import { queueWorkerFollowUp } from './queue-worker-follow-up.ts';
import { lockWorker, stopWorkerTurns } from './stop-worker-turns.ts';
import type { WorkerEffects } from './worker-effects.ts';
import { prepareWorkerEvents } from './worker-events.ts';
import { closeWorkerQuestion, readWorkerQuestion, requireOpenQuestion } from './worker-question.ts';
import { requireWorker } from './worker-shape.ts';
import { type WorkerViewer, canSeeWorker } from './worker-visibility.ts';

export async function sendAgentFollowUp(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentWorkerSendInput,
    storage: ArtifactStorage | null
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const worker = await lockOwnWorker(tx, runner, input.workerId);
        const queued = await queueWorkerFollowUp(tx, {
            followUp: {
                at: new Date().toISOString(),
                author: { id: runner.agentId, kind: 'agent' },
                kind: 'follow-up',
                messageId: null,
                text: input.text,
            },
            interrupt: input.interrupt,
            nonce: input.nonce,
            worker,
        });
        const effects = await withDispatch(tx, storage, runner.serverId, {
            ...queued.effects,
            workerIds: queued.idempotent ? [] : [worker.id],
        });
        return {
            effects,
            receipt: {
                idempotent: queued.idempotent,
                turnId: queued.turnId,
                worker: await requireWorker(tx, runner.serverId, worker.id),
            },
        };
    });
}

export async function stopAgentWorker(
    db: HausDatabase,
    runner: ResolvedRunner,
    workerId: string,
    storage: ArtifactStorage | null
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const worker = await lockOwnWorker(tx, runner, workerId);
        return await stopLockedWorker(tx, storage, worker, { id: runner.agentId, kind: 'agent' });
    });
}

export async function stopWorkerAsPerson(
    db: HausDatabase,
    input: { serverId: string; userId: string; workerId: string },
    storage: ArtifactStorage | null
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireVisibleWorker(tx, {
            serverId: input.serverId,
            viewer: { kind: 'user', userId: input.userId },
            workerId: input.workerId,
        });
        const worker = await lockWorker(tx, input.serverId, input.workerId);
        return await stopLockedWorker(tx, storage, worker, { id: input.userId, kind: 'user' });
    });
}

export async function requireVisibleWorker(
    db: Pick<HausDatabase, 'select'>,
    input: { serverId: string; viewer: WorkerViewer; workerId: string }
) {
    if (!(await canSeeWorker(db, input))) {
        throw new WorkerNotFoundError();
    }
    return await requireWorker(db, input.serverId, input.workerId);
}

async function stopLockedWorker(
    tx: HausDatabase,
    storage: ArtifactStorage | null,
    worker: Awaited<ReturnType<typeof lockWorker>>,
    requestedBy: WorkerStopRequestedBy
) {
    const stopped = await stopWorkerTurns(tx, { requestedBy, worker });
    if (!stopped.stopped) {
        await closeOpenQuestion(tx, worker, { by: requestedBy, reason: 'stopped' });
    }
    return {
        effects: await withDispatch(tx, storage, worker.serverId, {
            ...stopped.effects,
            workerIds: [worker.id],
        }),
        worker: await requireWorker(tx, worker.serverId, worker.id),
    };
}

export async function dismissWorkerQuestion(
    db: HausDatabase,
    input: { serverId: string; turnId: string; userId: string; workerId: string }
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireVisibleWorker(tx, {
            serverId: input.serverId,
            viewer: { kind: 'user', userId: input.userId },
            workerId: input.workerId,
        });
        const worker = await lockWorker(tx, input.serverId, input.workerId);
        const turn = await requireOpenQuestion(tx, worker, input.turnId);
        await closeWorkerQuestion(tx, {
            closed: {
                at: new Date().toISOString(),
                by: { id: input.userId, kind: 'user' },
                reason: 'dismissed',
            },
            turn,
        });
        await touchWorker(tx, worker);
        return {
            effects: {
                events: await prepareWorkerEvents(tx, {
                    serverId: worker.serverId,
                    workerIds: [worker.id],
                }),
                frames: [],
                wakes: [],
            } satisfies WorkerEffects,
            worker: await requireWorker(tx, worker.serverId, worker.id),
        };
    });
}

async function closeOpenQuestion(
    tx: HausDatabase,
    worker: Awaited<ReturnType<typeof lockWorker>>,
    input: { by: WorkerStopRequestedBy; reason: 'stopped' }
) {
    const { newest, question } = await readWorkerQuestion(tx, worker);
    if (!(newest && question?.open)) {
        throw new WorkerNotLiveError();
    }
    await closeWorkerQuestion(tx, {
        closed: { at: new Date().toISOString(), by: input.by, reason: input.reason },
        turn: newest,
    });
    await touchWorker(tx, worker);
}

async function touchWorker(tx: HausDatabase, worker: { id: string; serverId: string }) {
    await tx
        .update(workersTable)
        .set({ updatedAt: sql`now()` })
        .where(and(eq(workersTable.serverId, worker.serverId), eq(workersTable.id, worker.id)));
}

async function lockOwnWorker(tx: HausDatabase, runner: ResolvedRunner, workerId: string) {
    const worker = await lockWorker(tx, runner.serverId, workerId);
    if (worker.agentId !== runner.agentId) {
        throw new WorkerStopDeniedError();
    }
    return worker;
}
