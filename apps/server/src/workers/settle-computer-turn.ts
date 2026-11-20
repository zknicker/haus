import type { WorkerTurnEndedFrame } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnsTable, workersTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { decideComputerTurn } from './computer-turn-outcome.ts';
import { applyComputerOutcome } from './computer-turn-settlement.ts';
import { withDispatch } from './dispatch-worker-turns.ts';
import { mergeBranchEvidence } from './merge-branch-evidence.ts';
import { currentTurnAttempt } from './worker-turn-attempt.ts';

export async function settleComputerTurn(
    db: HausDatabase,
    agentDelivery: AgentDelivery,
    storage: ArtifactStorage | null,
    input: { computerId: string; frame: WorkerTurnEndedFrame; serverId: string }
) {
    const { frame } = input;
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const [row] = await tx
            .select({ turn: workerTurnsTable, worker: workersTable })
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
                    eq(workerTurnsTable.serverId, input.serverId),
                    eq(workerTurnsTable.id, frame.turnId)
                )
            )
            .for('update')
            .limit(1);
        if (
            !row ||
            row.worker.carrierComputerId !== input.computerId ||
            row.worker.place !== 'computer'
        ) {
            return null;
        }
        const { turn, worker } = row;
        await recordEnd(tx, { frame, turn, worker });
        if (turn.outcome) {
            return await withDispatch(tx, storage, worker.serverId, {
                events: [],
                frames: [],
                wakes: [],
                workerIds: [],
            });
        }
        if (currentTurnAttempt(turn) !== frame.attempt) {
            return null;
        }
        const effects = await applyComputerOutcome(tx, agentDelivery, {
            branches: frame.branches,
            decided: decideComputerTurn({
                draft: turn.reportDraft,
                exit: frame.exit,
                stopRequested: turn.stopRequestedAt !== null,
            }),
            turn,
            worker,
        });
        return await withDispatch(tx, storage, worker.serverId, {
            ...effects,
            workerIds: [worker.id],
        });
    });
}

async function recordEnd(
    tx: HausDatabase,
    input: {
        frame: WorkerTurnEndedFrame;
        turn: typeof workerTurnsTable.$inferSelect;
        worker: typeof workersTable.$inferSelect;
    }
) {
    const { frame, turn, worker } = input;
    await tx
        .update(workerTurnsTable)
        .set({
            branches: mergeBranchEvidence(turn.branches, frame.branches),
            endedAt: sql`coalesce(${workerTurnsTable.endedAt}, now())`,
        })
        .where(
            and(eq(workerTurnsTable.serverId, worker.serverId), eq(workerTurnsTable.id, turn.id))
        );
    await tx
        .update(workersTable)
        .set({
            ...(frame.branch ? { branch: frame.branch } : {}),
            nativeSessionId: sql`coalesce(${workersTable.nativeSessionId}, ${frame.sessionId})`,
            updatedAt: sql`now()`,
        })
        .where(and(eq(workersTable.serverId, worker.serverId), eq(workersTable.id, worker.id)));
}
