import {
    type WorkerQuestions,
    type WorkerReportDraft,
    type WorkerTurnQuestionFrame,
    workerQuestionsAsk,
    workerQuestionsText,
} from '@haus/api';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { workerTurnsTable, workersTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { readTask } from '../tasks/task-read.ts';
import { readCarriedTurn } from './computer-turn-frames.ts';
import { applyComputerOutcome } from './computer-turn-settlement.ts';
import { withDispatch } from './dispatch-worker-turns.ts';
import { resolveAskingPerson } from './worker-person.ts';
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

export async function questionDraft(
    tx: HausDatabase,
    input: {
        questions: WorkerQuestions;
        turn: Pick<typeof workerTurnsTable.$inferSelect, 'input' | 'reportDraft'>;
        worker: typeof workersTable.$inferSelect;
    }
) {
    const { questions, turn, worker } = input;
    const task = worker.taskId ? await readTask(tx, worker.serverId, worker.taskId) : null;
    const person = await resolveAskingPerson(tx, {
        input: turn.input,
        serverId: worker.serverId,
        taskChatId: task?.chatId ?? null,
    });
    return {
        ask: workerQuestionsAsk(questions),
        outcome: 'needs-you',
        personId: person?.id ?? null,
        pullRequestUrls: turn.reportDraft?.pullRequestUrls ?? [],
        questions,
        text: workerQuestionsText(questions),
    } satisfies WorkerReportDraft;
}
