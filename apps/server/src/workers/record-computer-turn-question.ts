import type { WorkerTurnQuestionFrame } from '@haus/api';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
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
        if (!row || row.turn.outcome || currentTurnAttempt(row.turn) !== frame.attempt) {
            return null;
        }
        const { turn, worker } = row;
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
