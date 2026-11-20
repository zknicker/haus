import { type WorkerPlace, type WorkerTurnStartFrame, workerPlaces } from '@haus/api';
import { and, asc, count, eq, isNotNull, isNull, lt, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    computersTable,
    workerPlaceLimitsTable,
    workerTurnsTable,
    workersTable,
} from '../postgres/schema.ts';
import { readTask } from '../tasks/task-read.ts';
import { composeWorkerInput } from './compose-worker-input.ts';
import type { WorkerEffects, WorkerFrame } from './worker-effects.ts';
import { prepareWorkerEvents } from './worker-events.ts';

export const defaultWorkerPlaceLimit = 10;

type TurnRow = typeof workerTurnsTable.$inferSelect;
type WorkerRow = typeof workersTable.$inferSelect;

const earlierTurns = alias(workerTurnsTable, 'earlier_turn');

export async function dispatchWorkerTurns(tx: HausDatabase, serverId: string) {
    const candidates = await readDispatchCandidates(tx, serverId);
    const free = await readFreeSlots(tx, serverId);
    const dispatched: Array<{ turn: TurnRow; worker: WorkerRow }> = [];
    for (const candidate of candidates) {
        const slots = free.get(candidate.worker.place) ?? defaultWorkerPlaceLimit;
        if (slots <= 0) {
            continue;
        }
        free.set(candidate.worker.place, slots - 1);
        await tx
            .update(workerTurnsTable)
            .set({ dispatchedAt: sql`now()` })
            .where(
                and(
                    eq(workerTurnsTable.serverId, serverId),
                    eq(workerTurnsTable.id, candidate.turn.id)
                )
            );
        await tx
            .update(workersTable)
            .set({ updatedAt: sql`now()` })
            .where(
                and(eq(workersTable.serverId, serverId), eq(workersTable.id, candidate.worker.id))
            );
        dispatched.push(candidate);
    }
    const frames: WorkerFrame[] = [];
    for (const { turn, worker } of dispatched) {
        frames.push({
            computerId: worker.carrierComputerId,
            frame: await workerTurnStartFrame(tx, { turn, worker }),
        });
    }
    return { frames, workerIds: dispatched.map(({ worker }) => worker.id) };
}

export async function withDispatch(
    tx: HausDatabase,
    serverId: string,
    effects: WorkerEffects & { workerIds: readonly string[] }
) {
    const dispatched = await dispatchWorkerTurns(tx, serverId);
    return {
        events: [
            ...effects.events,
            ...(await prepareWorkerEvents(tx, {
                serverId,
                workerIds: [...effects.workerIds, ...dispatched.workerIds],
            })),
        ],
        frames: [...effects.frames, ...dispatched.frames],
        wakes: effects.wakes,
    } satisfies WorkerEffects;
}

export async function workerTurnStartFrame(
    tx: HausDatabase,
    input: { turn: TurnRow; worker: WorkerRow }
) {
    const { turn, worker } = input;
    if (!(worker.taskId && turn.input)) {
        throw new Error(`Worker turn ${turn.id} has no Task or input to start.`);
    }
    const task = await readTask(tx, worker.serverId, worker.taskId);
    const predecessors = await tx
        .select({ id: workerTurnsTable.id })
        .from(workerTurnsTable)
        .where(
            and(
                eq(workerTurnsTable.serverId, worker.serverId),
                eq(workerTurnsTable.workerId, worker.id),
                lt(workerTurnsTable.createdAt, turn.createdAt)
            )
        )
        .orderBy(asc(workerTurnsTable.createdAt), asc(workerTurnsTable.id));
    return {
        input: await composeWorkerInput(tx, {
            inputs: turn.input,
            serverId: worker.serverId,
            taskKey: task.key,
        }),
        model: {
            droppedParams: turn.modelDroppedParams,
            fallbackFrom: turn.modelFallbackFrom,
            id: turn.modelId,
            params: turn.modelParams,
        },
        place: worker.place,
        predecessorTurnIds: predecessors.map(({ id }) => id),
        providerAgentId: worker.providerAgentId,
        repository: worker.repository,
        startingRef: worker.startingRef,
        title: worker.title,
        turnId: turn.id,
        type: 'worker-turn-start',
        workerId: worker.id,
    } satisfies WorkerTurnStartFrame;
}

async function readDispatchCandidates(tx: HausDatabase, serverId: string) {
    return await tx
        .select({ turn: workerTurnsTable, worker: workersTable })
        .from(workerTurnsTable)
        .innerJoin(
            workersTable,
            and(
                eq(workersTable.serverId, workerTurnsTable.serverId),
                eq(workersTable.id, workerTurnsTable.workerId)
            )
        )
        .innerJoin(
            computersTable,
            and(
                eq(computersTable.serverId, workersTable.serverId),
                eq(computersTable.id, workersTable.carrierComputerId)
            )
        )
        .where(
            and(
                eq(workerTurnsTable.serverId, serverId),
                isNull(workerTurnsTable.dispatchedAt),
                isNull(workerTurnsTable.outcome),
                isNotNull(workerTurnsTable.input),
                isNotNull(workersTable.taskId),
                isNull(workersTable.closingAt),
                isNull(workersTable.closedAt),
                notExists(
                    tx
                        .select({ one: sql`1` })
                        .from(earlierTurns)
                        .where(
                            and(
                                eq(earlierTurns.serverId, workerTurnsTable.serverId),
                                eq(earlierTurns.workerId, workerTurnsTable.workerId),
                                lt(earlierTurns.createdAt, workerTurnsTable.createdAt),
                                isNull(earlierTurns.outcome)
                            )
                        )
                )
            )
        )
        .orderBy(asc(workerTurnsTable.createdAt), asc(workerTurnsTable.id));
}

async function readFreeSlots(tx: HausDatabase, serverId: string) {
    const limits = await tx
        .select({ limit: workerPlaceLimitsTable.workerLimit, place: workerPlaceLimitsTable.place })
        .from(workerPlaceLimitsTable)
        .where(eq(workerPlaceLimitsTable.serverId, serverId));
    const busy = await tx
        .select({ busy: count(), place: workersTable.place })
        .from(workerTurnsTable)
        .innerJoin(
            workersTable,
            and(
                eq(workersTable.serverId, workerTurnsTable.serverId),
                eq(workersTable.id, workerTurnsTable.workerId)
            )
        )
        .where(
            and(
                eq(workerTurnsTable.serverId, serverId),
                isNotNull(workerTurnsTable.dispatchedAt),
                isNull(workerTurnsTable.outcome)
            )
        )
        .groupBy(workersTable.place);
    const limitOf = new Map(limits.map(({ limit, place }) => [place, limit]));
    const free = new Map<WorkerPlace, number>();
    for (const place of workerPlaces) {
        const used = busy.find((row) => row.place === place)?.busy ?? 0;
        free.set(place, (limitOf.get(place) ?? defaultWorkerPlaceLimit) - used);
    }
    return free;
}
