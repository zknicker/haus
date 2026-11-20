import type { AgentWorkerSendInput, WorkerStopRequestedBy } from '@haus/api';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { withDispatch } from './dispatch-worker-turns.ts';
import { WorkerNotFoundError, WorkerNotLiveError, WorkerStopDeniedError } from './errors.ts';
import { queueWorkerFollowUp } from './queue-worker-follow-up.ts';
import { lockWorker, stopWorkerTurns } from './stop-worker-turns.ts';
import { requireWorker } from './worker-shape.ts';
import { type WorkerViewer, canSeeWorker } from './worker-visibility.ts';

export async function sendAgentFollowUp(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentWorkerSendInput
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
        const effects = await withDispatch(tx, runner.serverId, {
            events: [],
            frames: queued.frames,
            wakes: [],
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

export async function stopAgentWorker(db: HausDatabase, runner: ResolvedRunner, workerId: string) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const worker = await lockOwnWorker(tx, runner, workerId);
        return await stopLockedWorker(tx, worker, { id: runner.agentId, kind: 'agent' });
    });
}

export async function stopWorkerAsPerson(
    db: HausDatabase,
    input: { serverId: string; userId: string; workerId: string }
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireVisibleWorker(tx, {
            serverId: input.serverId,
            viewer: { kind: 'user', userId: input.userId },
            workerId: input.workerId,
        });
        const worker = await lockWorker(tx, input.serverId, input.workerId);
        return await stopLockedWorker(tx, worker, { id: input.userId, kind: 'user' });
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
    worker: Awaited<ReturnType<typeof lockWorker>>,
    requestedBy: WorkerStopRequestedBy
) {
    const stopped = await stopWorkerTurns(tx, { requestedBy, worker });
    if (!stopped.stopped) {
        throw new WorkerNotLiveError();
    }
    return {
        effects: await withDispatch(tx, worker.serverId, {
            events: [],
            frames: stopped.frames,
            wakes: [],
            workerIds: [worker.id],
        }),
        worker: await requireWorker(tx, worker.serverId, worker.id),
    };
}

async function lockOwnWorker(tx: HausDatabase, runner: ResolvedRunner, workerId: string) {
    const worker = await lockWorker(tx, runner.serverId, workerId);
    if (worker.agentId !== runner.agentId) {
        throw new WorkerStopDeniedError();
    }
    return worker;
}
