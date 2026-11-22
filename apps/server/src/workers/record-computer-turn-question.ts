import type { WorkerTurnQuestionFrame } from '@haus/api';
import { and, desc, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable, workerTurnsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { readCarriedTurn } from './computer-turn-frames.ts';
import { applyComputerOutcome } from './computer-turn-settlement.ts';
import { withDispatch } from './dispatch-worker-turns.ts';
import { questionDraft } from './worker-question-draft.ts';
import { currentTurnAttempt } from './worker-turn-attempt.ts';

export async function recordComputerTurnQuestion(
    db: HausDatabase,
    delivery: AgentDelivery,
    storage: ArtifactStorage | null,
    input: { computerId: string; frame: WorkerTurnQuestionFrame; serverId: string }
) {
    const { frame } = input;
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const row = await readCarriedTurn(tx, input, frame.turnId);
        if (!row || currentTurnAttempt(row.turn) !== frame.attempt) {
            return null;
        }
        const { turn, worker } = row;
        if (turn.outcome && !(await replacesOfflineFailure(tx, turn))) {
            return null;
        }
        const effects = await applyComputerOutcome(tx, delivery, {
            branches: [],
            decided: {
                draft: await questionDraft(tx, { questions: frame.questions, turn, worker }),
                kind: 'report',
            },
            turn,
            worker,
        });
        return await withDispatch(tx, storage, worker.serverId, {
            ...effects,
            workerIds: [worker.id],
        });
    });
}

async function replacesOfflineFailure(
    tx: HausDatabase,
    turn: typeof workerTurnsTable.$inferSelect
) {
    if (!(turn.outcome?.kind === 'failed' && turn.outcome.reason === 'machine-offline')) {
        return false;
    }
    const [newest] = await tx
        .select({ id: workerTurnsTable.id })
        .from(workerTurnsTable)
        .where(
            and(
                eq(workerTurnsTable.serverId, turn.serverId),
                eq(workerTurnsTable.workerId, turn.workerId)
            )
        )
        .orderBy(desc(workerTurnsTable.createdAt), desc(workerTurnsTable.id))
        .limit(1);
    if (newest?.id !== turn.id) {
        return false;
    }
    await tx
        .delete(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.serverId, turn.serverId),
                eq(agentInboxTable.workerTurnId, turn.id),
                eq(agentInboxTable.source, 'worker_report'),
                eq(agentInboxTable.state, 'queued')
            )
        );
    return true;
}
