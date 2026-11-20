import type {
    AgentWorkerHeld,
    AgentWorkerReceipt,
    AgentWorkerStartInput,
    WorkerTurnInput,
} from '@haus/api';
import { and, asc, eq } from 'drizzle-orm';
import { followAgentTask } from '../agent-api/attention.ts';
import { readFreshnessHold } from '../agent-api/send-hold.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { workerTurnsTable, workersTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { resolveRunModel } from './cloud-agent-model.ts';
import { withDispatch } from './dispatch-worker-turns.ts';
import { WorkerConflictError, WorkerPlaceRequiredError } from './errors.ts';
import { chooseCarrier, readDefaultPlace, readReadyPlaces } from './worker-carrier.ts';
import { type WorkerEffects, noWorkerEffects } from './worker-effects.ts';
import { requireOpenWorkerTask } from './worker-launch-task.ts';
import { requireWorker } from './worker-shape.ts';

type StartWorkerResult =
    | { effects: WorkerEffects; kind: 'started'; receipt: AgentWorkerReceipt }
    | { held: AgentWorkerHeld; kind: 'held' };

export async function startWorker(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentWorkerStartInput
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const task = await requireOpenWorkerTask(tx, runner, input.task);
        const existing = await readStartedByNonce(tx, runner, input, task.taskId);
        if (existing) {
            return {
                effects: noWorkerEffects,
                kind: 'started',
                receipt: existing,
            } satisfies StartWorkerResult;
        }
        const place = input.place ?? (await readDefaultPlace(tx, runner));
        if (!place) {
            throw new WorkerPlaceRequiredError(await readReadyPlaces(tx, runner.serverId));
        }
        const carrierComputerId = await chooseCarrier(tx, {
            agentId: runner.agentId,
            place,
            serverId: runner.serverId,
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
        const workerId = createOpaqueId('wkr');
        await tx.insert(workersTable).values({
            agentId: runner.agentId,
            carrierComputerId,
            id: workerId,
            place,
            repository: input.repository,
            serverId: runner.serverId,
            startNonce: input.nonce,
            startingRef: input.startingRef,
            taskId: task.taskId,
            title: input.title,
        });
        const model = await resolveRunModel(tx, {
            computerId: carrierComputerId,
            provider: place,
            serverId: runner.serverId,
        });
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
            effects: await withDispatch(tx, runner.serverId, {
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
    input: AgentWorkerStartInput,
    taskId: string
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
        (input.place && worker.place !== input.place) ||
        worker.title !== input.title ||
        worker.repository !== input.repository ||
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
