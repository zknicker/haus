import type { TaskActor } from '@haus/api';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnsTable, workersTable } from '../postgres/schema.ts';
import { closeWhenSettled, queueWorkerReport } from './settle-worker-turn.ts';
import { stopWorkerTurns } from './stop-worker-turns.ts';
import { workerCloseFrames } from './worker-close-frames.ts';
import type { WorkerEffects } from './worker-effects.ts';
import { prepareWorkerEvents } from './worker-events.ts';

export async function closeTaskWorkers(
    tx: HausDatabase,
    agentDelivery: AgentDelivery,
    input: { actor: TaskActor; serverId: string; taskChatId: string | null; taskId: string }
) {
    const closing = await tx
        .update(workersTable)
        .set({ closingAt: sql`coalesce(${workersTable.closingAt}, now())`, updatedAt: sql`now()` })
        .where(
            and(
                eq(workersTable.serverId, input.serverId),
                eq(workersTable.taskId, input.taskId),
                isNull(workersTable.closedAt)
            )
        )
        .returning();
    const effects: WorkerEffects = { events: [], frames: [], wakes: [] };
    const requestedBy =
        input.actor.kind === 'agent'
            ? ({ id: input.actor.agentId, kind: 'agent' } as const)
            : ({ id: input.actor.userId, kind: 'user' } as const);
    for (const worker of closing) {
        const stopped = await stopWorkerTurns(tx, { requestedBy, worker });
        effects.frames.push(...stopped.frames);
        const [newest] = await tx
            .select({ id: workerTurnsTable.id, outcome: workerTurnsTable.outcome })
            .from(workerTurnsTable)
            .where(
                and(
                    eq(workerTurnsTable.serverId, worker.serverId),
                    eq(workerTurnsTable.workerId, worker.id)
                )
            )
            .orderBy(desc(workerTurnsTable.createdAt), desc(workerTurnsTable.id))
            .limit(1);
        const settledByClose =
            newest?.outcome &&
            stopped.stoppedTurnIds.includes(newest.id) &&
            stopped.frames.length === 0;
        if (newest?.outcome && settledByClose) {
            const wake = await queueWorkerReport(tx, agentDelivery, {
                outcome: newest.outcome,
                taskChatId: input.taskChatId,
                turnId: newest.id,
                worker,
            });
            if (wake) {
                effects.wakes.push(wake);
            }
        }
        await closeWhenSettled(tx, worker);
    }
    effects.frames.push(
        ...(await workerCloseFrames(
            tx,
            input.serverId,
            closing.map((worker) => worker.id)
        ))
    );
    effects.events.push(
        ...(await prepareWorkerEvents(tx, {
            serverId: input.serverId,
            workerIds: closing.map((worker) => worker.id),
        }))
    );
    return effects;
}
