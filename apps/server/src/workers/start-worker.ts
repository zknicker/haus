import {
    type AgentWorkerHeld,
    type AgentWorkerReceipt,
    type AgentWorkerStartInput,
    type WorkerPlace,
    type WorkerTurnInput,
    formatWorkerPlace,
} from '@haus/api';
import { and, asc, eq } from 'drizzle-orm';
import { followAgentTask } from '../agent-api/attention.ts';
import { readFreshnessHold } from '../agent-api/send-hold.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { projectReposTable, workerTurnsTable, workersTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { withDispatch } from './dispatch-worker-turns.ts';
import { WorkerConflictError } from './errors.ts';
import { resolveRequestedPlace } from './resolve-worker-place.ts';
import { resolveWorkerStart } from './resolve-worker-start.ts';
import { type WorkerEffects, noWorkerEffects } from './worker-effects.ts';
import { requireOpenWorkerTask } from './worker-launch-task.ts';
import { workerPlaceOf } from './worker-row-place.ts';
import { requireWorker } from './worker-shape.ts';
import { turnModel } from './worker-turn-model.ts';

type StartWorkerResult =
    | { effects: WorkerEffects; kind: 'started'; receipt: AgentWorkerReceipt }
    | { held: AgentWorkerHeld; kind: 'held' };

export async function startWorker(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentWorkerStartInput,
    storage: ArtifactStorage | null
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const task = await requireOpenWorkerTask(tx, runner, input.task);
        const requested = await resolveRequestedPlace(tx, runner.serverId, input.place);
        const existing = await readStartedByNonce(tx, runner, {
            input,
            requested,
            taskId: task.taskId,
        });
        if (existing) {
            return {
                effects: noWorkerEffects,
                kind: 'started',
                receipt: existing,
            } satisfies StartWorkerResult;
        }
        const plan = await resolveWorkerStart(tx, runner, {
            ...input,
            projectId: task.projectId,
            requested,
        });
        const hold = await readFreshnessHold(tx, runner, task.chatId);
        if (hold) {
            return { held: { ...hold, state: 'held' }, kind: 'held' } satisfies StartWorkerResult;
        }
        await followAgentTask(tx, {
            agentId: runner.agentId,
            serverId: runner.serverId,
            taskChatId: task.chatId,
        });
        if (plan.addRepository) {
            await tx
                .insert(projectReposTable)
                .values({
                    id: createOpaqueId('prp'),
                    projectId: task.projectId,
                    repository: plan.repository,
                    serverId: runner.serverId,
                })
                .onConflictDoNothing();
        }
        const workerId = createOpaqueId('wkr');
        await tx.insert(workersTable).values({
            agentId: runner.agentId,
            carrierComputerId: plan.carrierComputerId,
            id: workerId,
            model: plan.model,
            place: plan.place.kind,
            repository: plan.repository,
            runtime: plan.runtime,
            serverId: runner.serverId,
            startNonce: input.nonce,
            startingRef: input.startingRef,
            taskId: task.taskId,
            title: input.title,
        });
        const model = await turnModel(tx, runner.serverId, plan);
        const brief: WorkerTurnInput = {
            at: new Date().toISOString(),
            author: { id: runner.agentId, kind: 'agent' },
            kind: 'brief',
            messageId: null,
            text: input.brief,
        };
        await tx.insert(workerTurnsTable).values({
            id: createOpaqueId('wkt'),
            input: [brief],
            modelDroppedParams: model.droppedParams,
            modelFallbackFrom: model.fallbackFrom,
            modelId: model.id,
            modelParams: model.params,
            serverId: runner.serverId,
            workerId,
        });
        return {
            effects: await withDispatch(tx, storage, runner.serverId, {
                ...noWorkerEffects,
                workerIds: [workerId],
            }),
            kind: 'started',
            receipt: await startReceipt(tx, runner.serverId, workerId),
        } satisfies StartWorkerResult;
    });
}

async function readStartedByNonce(
    tx: HausDatabase,
    runner: ResolvedRunner,
    {
        input,
        requested,
        taskId,
    }: { input: AgentWorkerStartInput; requested: WorkerPlace | null; taskId: string }
) {
    const [row] = await tx
        .select({ turn: workerTurnsTable, worker: workersTable })
        .from(workersTable)
        .innerJoin(
            workerTurnsTable,
            and(
                eq(workerTurnsTable.serverId, workersTable.serverId),
                eq(workerTurnsTable.workerId, workersTable.id)
            )
        )
        .where(
            and(
                eq(workersTable.serverId, runner.serverId),
                eq(workersTable.agentId, runner.agentId),
                eq(workersTable.startNonce, input.nonce)
            )
        )
        .orderBy(asc(workerTurnsTable.createdAt), asc(workerTurnsTable.id))
        .limit(1);
    if (!row) {
        return null;
    }
    const { turn, worker } = row;
    if (
        worker.taskId !== taskId ||
        (requested && formatWorkerPlace(workerPlaceOf(worker)) !== formatWorkerPlace(requested)) ||
        worker.title !== input.title ||
        (input.repository !== undefined &&
            worker.repository.toLowerCase() !== input.repository.toLowerCase()) ||
        worker.startingRef !== input.startingRef ||
        turn.input?.[0]?.text !== input.brief
    ) {
        throw new WorkerConflictError();
    }
    return await startReceipt(tx, runner.serverId, worker.id);
}

async function startReceipt(tx: HausDatabase, serverId: string, workerId: string) {
    const worker = await requireWorker(tx, serverId, workerId);
    const first = worker.turns.at(-1);
    return {
        state: first?.dispatchedAt ? 'started' : 'queued',
        worker,
    } satisfies AgentWorkerReceipt;
}
