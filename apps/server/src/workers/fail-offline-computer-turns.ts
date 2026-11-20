import { and, asc, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { type SweepTimers, startBootSweep } from '../boot-sweep.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable, workerTurnsTable, workersTable } from '../postgres/schema.ts';
import { publishRealtime } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { settleWorkerTurnAsFailed } from './settle-worker-turn.ts';
import { prepareWorkerEvents } from './worker-events.ts';

export const machineOfflineAfterMs = 30 * 60_000;

const sweepIntervalMs = 60_000;

export async function failOfflineComputerTurns(
    db: HausDatabase,
    agentDelivery: Pick<AgentDelivery, 'enqueue'>,
    now: Date
) {
    const before = new Date(now.getTime() - machineOfflineAfterMs);
    const stranded = await readStrandedTurns(db, before);
    const wakes: Array<{ agentId: string; serverId: string }> = [];
    for (const serverId of new Set(stranded.map((turn) => turn.serverId))) {
        const events = await db.transaction(async (tx) => {
            await lockServerRow(tx, serverId);
            const current = (await readStrandedTurns(tx, before)).filter(
                (turn) => turn.serverId === serverId
            );
            for (const { turnId, worker } of current) {
                const delivered = await settleWorkerTurnAsFailed(tx, agentDelivery, {
                    reason: 'machine-offline',
                    turnId,
                    worker,
                });
                if (delivered) {
                    wakes.push(delivered);
                }
            }
            return await prepareWorkerEvents(tx, {
                serverId,
                workerIds: current.map(({ worker }) => worker.id),
            });
        });
        publishRealtime(events);
    }
    return { settledTurnIds: stranded.map((turn) => turn.turnId), wakes };
}

export function startOfflineComputerTurnSweep(
    input: {
        agentDelivery: Pick<AgentDelivery, 'enqueue'>;
        clock: { now(): Date };
        db: HausDatabase;
        wakeAgents?(wakes: { agentId: string; serverId: string }[]): void;
    },
    timers?: SweepTimers
) {
    return startBootSweep({
        intervalMs: sweepIntervalMs,
        name: 'offline Computer Worker turn sweep',
        run: async () => {
            const failed = await failOfflineComputerTurns(
                input.db,
                input.agentDelivery,
                input.clock.now()
            );
            input.wakeAgents?.(failed.wakes);
        },
        timers,
    });
}

async function readStrandedTurns(db: Pick<HausDatabase, 'select'>, before: Date) {
    return await db
        .select({
            serverId: workerTurnsTable.serverId,
            turnId: workerTurnsTable.id,
            worker: workersTable,
        })
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
                eq(workersTable.place, 'computer'),
                isNotNull(workerTurnsTable.dispatchedAt),
                isNull(workerTurnsTable.outcome),
                eq(computersTable.health, 'offline'),
                lte(computersTable.disconnectedAt, before)
            )
        )
        .orderBy(asc(workerTurnsTable.createdAt), asc(workerTurnsTable.id));
}
