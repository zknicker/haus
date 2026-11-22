import { type WorkerQuestions, workerQuestionsText } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { agentInboxTable, chatMessagesTable } from '../src/postgres/schema.ts';
import { findUserById } from '../src/users/haus-user.ts';
import { recordComputerTurnQuestion } from '../src/workers/record-computer-turn-question.ts';
import { sendPersonFollowUp } from '../src/workers/send-person-follow-up.ts';
import type { offlineDelivery } from './agent-inbox-harness.ts';
import { type WorkerBoard, readTurns } from './worker-board.fixture.ts';
import { endTurn, startComputerWorker } from './worker-computer-turn.fixture.ts';

export const questions: WorkerQuestions = [
    {
        header: 'Database',
        multiSelect: false,
        options: [
            { description: 'The default.', label: 'Postgres' },
            { description: null, label: 'SQLite' },
        ],
        question: 'Which database should I use?',
    },
];

export const questionsText = workerQuestionsText(questions);

export async function ask(
    db: HausDatabase,
    board: WorkerBoard,
    delivery: ReturnType<typeof offlineDelivery>['delivery'],
    turnId: string,
    asked: WorkerQuestions = questions,
    attempt = 1
) {
    return await recordComputerTurnQuestion(db, delivery, null, {
        computerId: board.seed.computerId,
        frame: { attempt, questions: asked, turnId, type: 'worker-turn-question' },
        serverId: board.seed.serverId,
    });
}

export async function personTurn(
    db: HausDatabase,
    board: WorkerBoard,
    delivery: ReturnType<typeof offlineDelivery>['delivery']
) {
    const first = await startComputerWorker(db, board);
    await ask(db, board, delivery, first.turnId);
    await endTurn(db, delivery, board, { exit: 'exited', turnId: first.turnId });
    await answer(db, board, delivery, {
        nonce: 'person-turn',
        text: 'Pick one for me.',
        workerId: first.workerId,
    });
    const [, next] = await readTurns(db, first.workerId);
    return { turnId: next?.id ?? '', workerId: first.workerId };
}

export async function answer(
    db: HausDatabase,
    board: WorkerBoard,
    delivery: ReturnType<typeof offlineDelivery>['delivery'],
    input: { answersTurnId?: string; nonce: string; text: string; workerId: string }
) {
    const member = await findUserById(db, board.seed.userId);
    if (!member) {
        throw new Error('The seeded person is missing.');
    }
    return await sendPersonFollowUp(
        db,
        member,
        { ...input, serverId: board.seed.serverId },
        delivery
    );
}

export async function reportMessages(db: HausDatabase, board: WorkerBoard) {
    return await db
        .select({
            content: chatMessagesTable.content,
            mentionedUserIds: chatMessagesTable.mentionedUserIds,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.chatId, board.task.chatId),
                eq(chatMessagesTable.bodyKind, 'worker-report')
            )
        )
        .orderBy(chatMessagesTable.sequence);
}

export async function reportItems(db: HausDatabase, board: WorkerBoard, turnId: string) {
    const rows = await db
        .select({ source: agentInboxTable.source })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.agentId, board.seed.agentId),
                eq(agentInboxTable.workerTurnId, turnId)
            )
        );
    return rows.map((row) => row.source);
}
