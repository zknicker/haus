import {
    type WorkerQuestions,
    type WorkerReportDraft,
    workerQuestionsAsk,
    workerQuestionsText,
} from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { workerTurnsTable, workersTable } from '../postgres/schema.ts';
import { readTask } from '../tasks/task-read.ts';
import { resolveAskingPerson } from './worker-person.ts';

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
