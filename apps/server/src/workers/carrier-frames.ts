import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { withDispatch } from './dispatch-worker-turns.ts';
import { listComputerWorker, listUnacknowledgedTurns } from './list-computer-worker.ts';
import type { WorkerFrame } from './worker-effects.ts';
import { workerTurnStartFrame } from './worker-turn-start-frame.ts';

export async function planCarrierReconnect(
    db: HausDatabase,
    computer: { id: string; serverId: string },
    storage: ArtifactStorage | null
) {
    const scope = { computerId: computer.id, serverId: computer.serverId };
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, computer.serverId);
        const frames: WorkerFrame[] = [];
        for (const unacknowledged of await listUnacknowledgedTurns(tx, scope)) {
            frames.push({
                computerId: computer.id,
                frame: await workerTurnStartFrame(tx, storage, unacknowledged),
            });
        }
        const carried = await listComputerWorker(tx, scope);
        for (let offset = 0; offset < carried.length; offset += 200) {
            frames.push({
                computerId: computer.id,
                frame: { type: 'worker-reconcile', workers: carried.slice(offset, offset + 200) },
            });
        }
        return await withDispatch(tx, storage, computer.serverId, {
            events: [],
            frames,
            wakes: [],
            workerIds: [],
        });
    });
}

export async function acceptWorkerTurn(
    db: HausDatabase,
    input: { attempt: number; computerId: string; serverId: string; turnId: string },
    storage: ArtifactStorage | null
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const accepted = await tx
            .update(workerTurnsTable)
            .set({ acceptedAttempt: input.attempt, acknowledgedAt: sql`now()` })
            .where(
                and(
                    eq(workerTurnsTable.serverId, input.serverId),
                    eq(workerTurnsTable.id, input.turnId),
                    isNull(workerTurnsTable.acknowledgedAt),
                    sql`${workerTurnsTable.dispatchedAt} is not null`,
                    sql`exists (
                        select 1 from workers carrier
                        where carrier.server_id = ${workerTurnsTable.serverId}
                            and carrier.id = ${workerTurnsTable.workerId}
                            and carrier.carrier_computer_id = ${input.computerId}
                    )`
                )
            )
            .returning({ workerId: workerTurnsTable.workerId });
        return await withDispatch(tx, storage, input.serverId, {
            events: [],
            frames: [],
            wakes: [],
            workerIds: accepted.map(({ workerId }) => workerId),
        });
    });
}
