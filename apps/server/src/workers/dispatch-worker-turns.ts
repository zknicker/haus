import { cloudAgentProviders } from '@haus/api';
import {
    and,
    asc,
    count,
    eq,
    inArray,
    isNotNull,
    isNull,
    lt,
    notExists,
    or,
    sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    computersTable,
    workerPlaceLimitsTable,
    workerTurnsTable,
    workersTable,
} from '../postgres/schema.ts';
import { owesHarnessStop } from './harness-stop.ts';
import { readWorkerRepoLink } from './read-worker-repo-link.ts';
import { workerCloseFrames } from './worker-close-frames.ts';
import type { WorkerEffects, WorkerFrame } from './worker-effects.ts';
import { prepareWorkerEvents } from './worker-events.ts';
import { refuseUnlinkedTurn } from './worker-repo-link.ts';
import { workerTurnStartFrame } from './worker-turn-start-frame.ts';

export const defaultWorkerPlaceLimit = 10;

type TurnRow = typeof workerTurnsTable.$inferSelect;
type WorkerRow = typeof workersTable.$inferSelect;

const earlierTurns = alias(workerTurnsTable, 'earlier_turn');

export async function dispatchWorkerTurns(
    tx: HausDatabase,
    storage: ArtifactStorage | null,
    serverId: string
) {
    const candidates = await readDispatchCandidates(tx, serverId);
    const free = await readFreeSlots(tx, serverId);
    const dispatched: Array<{ turn: TurnRow; worker: WorkerRow }> = [];
    const refusedWorkerIds: string[] = [];
    const wakes: Array<{ agentId: string; serverId: string }> = [];
    for (const candidate of candidates) {
        if (
            candidate.worker.place === 'computer' &&
            !(await readWorkerRepoLink(tx, candidate.worker))
        ) {
            const wake = await refuseUnlinkedTurn(tx, {
                turnId: candidate.turn.id,
                worker: candidate.worker,
            });
            wakes.push(...(wake ? [wake] : []));
            refusedWorkerIds.push(candidate.worker.id);
            continue;
        }
        const key = slotKey(candidate.worker);
        const slots = free.get(key) ?? defaultWorkerPlaceLimit;
        if (slots <= 0) {
            continue;
        }
        free.set(key, slots - 1);
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
            frame: await workerTurnStartFrame(tx, storage, { turn, worker }),
        });
    }
    return {
        frames,
        wakes,
        workerIds: [...dispatched.map(({ worker }) => worker.id), ...refusedWorkerIds],
    };
}

export async function withDispatch(
    tx: HausDatabase,
    storage: ArtifactStorage | null,
    serverId: string,
    effects: WorkerEffects & { workerIds: readonly string[] }
) {
    const dispatched = await dispatchWorkerTurns(tx, storage, serverId);
    const closing = await workerCloseFrames(tx, serverId, effects.workerIds);
    return {
        events: [
            ...effects.events,
            ...(await prepareWorkerEvents(tx, {
                serverId,
                workerIds: [...effects.workerIds, ...dispatched.workerIds],
            })),
        ],
        frames: [...effects.frames, ...closing, ...dispatched.frames],
        wakes: [...effects.wakes, ...dispatched.wakes],
    } satisfies WorkerEffects;
}

function slotKey(worker: Pick<WorkerRow, 'carrierComputerId' | 'place'>) {
    return worker.place === 'computer' ? `computer:${worker.carrierComputerId}` : worker.place;
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
                or(
                    sql`${workersTable.place} <> 'computer'`,
                    and(
                        eq(computersTable.workersEnabled, true),
                        inArray(computersTable.health, ['healthy', 'degraded'])
                    )
                ),
                notExists(
                    tx
                        .select({ one: sql`1` })
                        .from(earlierTurns)
                        .where(
                            and(
                                eq(earlierTurns.serverId, workerTurnsTable.serverId),
                                eq(earlierTurns.workerId, workerTurnsTable.workerId),
                                lt(earlierTurns.createdAt, workerTurnsTable.createdAt),
                                or(isNull(earlierTurns.outcome), owesHarnessStop(earlierTurns))
                            )
                        )
                )
            )
        )
        .orderBy(asc(workerTurnsTable.createdAt), asc(workerTurnsTable.id));
}

export async function readFreeSlots(tx: Pick<HausDatabase, 'select'>, serverId: string) {
    const limits = await tx
        .select({ limit: workerPlaceLimitsTable.workerLimit, place: workerPlaceLimitsTable.place })
        .from(workerPlaceLimitsTable)
        .where(eq(workerPlaceLimitsTable.serverId, serverId));
    const computers = await tx
        .select({ id: computersTable.id, limit: computersTable.workerLimit })
        .from(computersTable)
        .where(eq(computersTable.serverId, serverId));
    const busy = await tx
        .select({
            busy: count(),
            computerId: workersTable.carrierComputerId,
            place: workersTable.place,
        })
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
        .groupBy(workersTable.place, workersTable.carrierComputerId);
    const used = new Map<string, number>();
    for (const row of busy) {
        const key = slotKey({ carrierComputerId: row.computerId, place: row.place });
        used.set(key, (used.get(key) ?? 0) + row.busy);
    }
    const limitOf = new Map(limits.map(({ limit, place }) => [place, limit]));
    const free = new Map<string, number>();
    for (const place of cloudAgentProviders) {
        free.set(place, (limitOf.get(place) ?? defaultWorkerPlaceLimit) - (used.get(place) ?? 0));
    }
    for (const computer of computers) {
        const key = `computer:${computer.id}`;
        free.set(key, computer.limit - (used.get(key) ?? 0));
    }
    return free;
}
