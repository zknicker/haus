import { type WorkerFollowUpDrainFrame, workerTurnInputTextMaxLength } from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnsTable, workersTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { resolveRunModel } from './cloud-agent-model.ts';
import { withDispatch, workerTurnStartFrame } from './dispatch-worker-turns.ts';
import { listComputerWorker, listUnacknowledgedTurns } from './list-computer-worker.ts';
import type { WorkerFrame } from './worker-effects.ts';

export async function planCarrierReconnect(
    db: HausDatabase,
    computer: { id: string; serverId: string }
) {
    const scope = { computerId: computer.id, serverId: computer.serverId };
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, computer.serverId);
        const frames: WorkerFrame[] = [];
        for (const unacknowledged of await listUnacknowledgedTurns(tx, scope)) {
            frames.push({
                computerId: computer.id,
                frame: await workerTurnStartFrame(tx, unacknowledged),
            });
        }
        const carried = await listComputerWorker(tx, scope);
        for (let offset = 0; offset < carried.length; offset += 200) {
            frames.push({
                computerId: computer.id,
                frame: { type: 'worker-reconcile', workers: carried.slice(offset, offset + 200) },
            });
        }
        return await withDispatch(tx, computer.serverId, {
            events: [],
            frames,
            wakes: [],
            workerIds: [],
        });
    });
}

export async function acceptWorkerTurn(
    db: HausDatabase,
    input: { computerId: string; serverId: string; turnId: string }
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const accepted = await tx
            .update(workerTurnsTable)
            .set({ acknowledgedAt: sql`now()` })
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
        return await withDispatch(tx, input.serverId, {
            events: [],
            frames: [],
            wakes: [],
            workerIds: accepted.map(({ workerId }) => workerId),
        });
    });
}

export async function drainWorkerFollowUp(
    db: HausDatabase,
    input: { computerId: string; frame: WorkerFollowUpDrainFrame; serverId: string }
) {
    const { frame } = input;
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const [worker] = await tx
            .select()
            .from(workersTable)
            .where(
                and(eq(workersTable.serverId, input.serverId), eq(workersTable.id, frame.workerId))
            )
            .limit(1);
        const ack = {
            computerId: input.computerId,
            frame: { turnId: frame.turnId, type: 'worker-follow-up-drain-ack' as const },
        };
        if (!worker) {
            return { events: [], frames: [ack], wakes: [] };
        }
        if (worker.carrierComputerId !== input.computerId) {
            return { events: [], frames: [], wakes: [] };
        }
        if (!worker.providerAgentId && frame.providerAgentId) {
            await tx
                .update(workersTable)
                .set({ providerAgentId: frame.providerAgentId })
                .where(
                    and(eq(workersTable.serverId, worker.serverId), eq(workersTable.id, worker.id))
                );
        }
        const followUp = [
            {
                at: new Date().toISOString(),
                author: { id: worker.agentId, kind: 'agent' as const },
                kind: 'follow-up' as const,
                messageId: null,
                text: frame.instructions.slice(0, workerTurnInputTextMaxLength),
            },
        ];
        const reachedProvider = frame.providerRunId
            ? {
                  acknowledgedAt: sql`now()`,
                  dispatchedAt: sql`now()`,
                  providerRunId: frame.providerRunId,
              }
            : {};
        const [turn] = await tx
            .select({ input: workerTurnsTable.input })
            .from(workerTurnsTable)
            .where(
                and(
                    eq(workerTurnsTable.serverId, worker.serverId),
                    eq(workerTurnsTable.id, frame.turnId)
                )
            )
            .limit(1);
        if (!turn) {
            const model = await resolveRunModel(tx, {
                computerId: worker.carrierComputerId,
                provider: worker.place,
                serverId: worker.serverId,
            });
            await tx.insert(workerTurnsTable).values({
                id: frame.turnId,
                input: followUp,
                modelDroppedParams: model.droppedParams,
                modelFallbackFrom: model.fallbackFrom,
                modelId: model.id,
                modelParams: model.params,
                serverId: worker.serverId,
                workerId: worker.id,
                ...reachedProvider,
            });
        } else if (turn.input === null) {
            await tx
                .update(workerTurnsTable)
                .set({ input: followUp, ...reachedProvider })
                .where(
                    and(
                        eq(workerTurnsTable.serverId, worker.serverId),
                        eq(workerTurnsTable.id, frame.turnId)
                    )
                );
        }
        const dispatched = await withDispatch(tx, input.serverId, {
            events: [],
            frames: [],
            wakes: [],
            workerIds: [worker.id],
        });
        return { ...dispatched, frames: [ack, ...dispatched.frames] };
    });
}
