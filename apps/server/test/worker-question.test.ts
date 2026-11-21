import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type WorkerQuestions, workerAnswersText, workerQuestionsText } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentInboxTable, chatMessagesTable } from '../src/postgres/schema.ts';
import { findUserById } from '../src/users/haus-user.ts';
import { WorkerClosedError, WorkerQuestionClosedError } from '../src/workers/errors.ts';
import { failOfflineComputerTurns } from '../src/workers/fail-offline-computer-turns.ts';
import { recordComputerTurnQuestion } from '../src/workers/record-computer-turn-question.ts';
import { sendPersonFollowUp } from '../src/workers/send-person-follow-up.ts';
import {
    dismissWorkerQuestion,
    sendAgentFollowUp,
    stopWorkerAsPerson,
} from '../src/workers/worker-operations.ts';
import { requireWorker } from '../src/workers/worker-shape.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import {
    type WorkerBoard,
    closeTask,
    observe,
    readTurns,
    startOn,
} from './worker-board.fixture.ts';
import {
    computerPlaceBoard,
    endTurn,
    readTurn,
    startComputerWorker,
    takeComputerOffline,
} from './worker-computer-turn.fixture.ts';

let cluster: TestDatabase;
let connection: HausConnection;

beforeAll(async () => {
    cluster = await startMigratedDatabase();
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

const questions: WorkerQuestions = [
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

test('a question settles the turn needs-you at once, posts once, and wakes the Agent it is for', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);

    await ask(board, delivery, turnId);

    const turn = await readTurn(connection.db, turnId);
    expect(turn?.outcome).toMatchObject({
        kind: 'report',
        report: {
            ask: 'Which database should I use?',
            outcome: 'needs-you',
            personId: null,
            questions,
            source: 'worker',
            text: workerQuestionsText(questions),
        },
    });
    const messages = await reportMessages(board);
    expect(messages.map((message) => message.content)).toEqual([workerQuestionsText(questions)]);
    expect(await reportItems(board, turnId)).toEqual(['worker_report']);
    expect((await requireWorker(connection.db, board.seed.serverId, workerId)).status).toBe(
        'needs-you'
    );

    await ask(board, delivery, turnId, [{ ...questions[0], question: 'Again?' }]);
    expect((await readTurn(connection.db, turnId))?.outcome).toEqual(turn?.outcome ?? null);
    expect(await reportMessages(board)).toHaveLength(1);
});

test('a question in a turn a person started @mentions them and does not wake the Agent', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const asking = await personTurn(board, delivery);

    await ask(board, delivery, asking.turnId);

    expect((await readTurn(connection.db, asking.turnId))?.outcome).toMatchObject({
        report: { personId: board.seed.userId, questions },
    });
    const [, posted] = await reportMessages(board);
    expect(posted?.mentionedUserIds).toEqual([board.seed.userId]);
    expect(await reportItems(board, asking.turnId)).toEqual([]);
});

test('a captured question outlives the process and the Computer going offline', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId } = await startComputerWorker(connection.db, board);
    await ask(board, delivery, turnId);
    const asked = (await readTurn(connection.db, turnId))?.outcome;

    await takeComputerOffline(connection.db, board);
    await failOfflineComputerTurns(connection.db, delivery, new Date(Date.now() + 3_600_000));
    await endTurn(connection.db, delivery, board, { exit: 'uncertain', turnId });

    const turn = await readTurn(connection.db, turnId);
    expect(turn?.outcome).toEqual(asked ?? null);
    expect(turn?.endedAt).not.toBeNull();
});

test('a stale attempt asks nothing', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId } = await startComputerWorker(connection.db, board);

    await ask(board, delivery, turnId, questions, 7);

    expect((await readTurn(connection.db, turnId))?.outcome).toBeNull();
});

test('the first answer wins, and a later answer hears who answered', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);
    await ask(board, delivery, turnId);
    await endTurn(connection.db, delivery, board, { exit: 'exited', turnId });
    const text = workerAnswersText(questions, [{ labels: ['Postgres'], text: null }]);

    await answer(board, delivery, { answersTurnId: turnId, nonce: 'a-1', text, workerId });
    const refused = answer(board, delivery, {
        answersTurnId: turnId,
        nonce: 'a-2',
        text,
        workerId,
    });

    await expect(refused).rejects.toBeInstanceOf(WorkerQuestionClosedError);
    await expect(refused).rejects.toThrow(`Answered by @${board.seed.humanHandle}.`);
    const turns = await readTurns(connection.db, workerId);
    expect(turns.map((turn) => turn.input?.map((input) => input.text))).toEqual([
        ['Make the delivery test deterministic.'],
        ['1. **Which database should I use?** → Postgres'],
    ]);
});

test('the Agent answers with any follow-up, which closes the card', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);
    await ask(board, delivery, turnId);
    await endTurn(connection.db, delivery, board, { exit: 'exited', turnId });

    await sendAgentFollowUp(
        connection.db,
        board.runner,
        { interrupt: false, nonce: 'agent-answer', text: 'Use Postgres.', workerId },
        null
    );
    const refused = answer(board, delivery, {
        answersTurnId: turnId,
        nonce: 'late',
        text: 'SQLite',
        workerId,
    });

    await expect(refused).rejects.toThrow('Answered by @');
});

test('Dismiss closes the questions for everyone, attributed, and starts no turn', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);
    await ask(board, delivery, turnId);
    const input = { serverId: board.seed.serverId, turnId, userId: board.seed.userId, workerId };

    const dismissed = await dismissWorkerQuestion(connection.db, input);

    expect(dismissed.worker.status).toBe('needs-you');
    expect(dismissed.worker.turns[0]?.outcome).toMatchObject({
        report: {
            questionsClosed: { by: { id: board.seed.userId, kind: 'user' }, reason: 'dismissed' },
        },
    });
    expect(await readTurns(connection.db, workerId)).toHaveLength(1);
    await expect(dismissWorkerQuestion(connection.db, input)).rejects.toThrow(
        `Dismissed by @${board.seed.humanHandle}.`
    );
});

test('Stop closes open questions, and a closed Task refuses answers', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);
    await ask(board, delivery, turnId);

    await stopWorkerAsPerson(
        connection.db,
        { serverId: board.seed.serverId, userId: board.seed.userId, workerId },
        null
    );

    expect((await readTurn(connection.db, turnId))?.outcome).toMatchObject({
        report: { questionsClosed: { reason: 'stopped' } },
    });
    await closeTask(connection.db, board, delivery);
    await expect(
        answer(board, delivery, {
            answersTurnId: turnId,
            nonce: 'closed',
            text: 'Postgres',
            workerId,
        })
    ).rejects.toBeInstanceOf(WorkerClosedError);
});

test('a Claude cloud question settles with its questions, and a permission wait without them', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const settled = [];
    for (const asked of [questions, undefined]) {
        const { worker } = (await startOn(connection.db, board, { place: 'claude' })).receipt;
        const turnId = worker.turns[0]?.turnId ?? '';
        await observe(connection.db, delivery, board, {
            ...(asked ? { questions: asked } : {}),
            result: {
                outcome: null,
                personHandle: null,
                pullRequestUrls: [],
                text: 'Claude is asking to use WebFetch.',
            },
            status: 'pending_input',
            turnId,
            workerId: worker.id,
        });
        settled.push((await readTurn(connection.db, turnId))?.outcome);
    }

    expect(settled[0]).toMatchObject({
        report: {
            outcome: 'needs-you',
            questions,
            source: 'provider',
            text: workerQuestionsText(questions),
        },
    });
    expect(settled[1]).toMatchObject({
        report: { outcome: 'needs-you', text: 'Claude is asking to use WebFetch.' },
    });
    expect(settled[1]).not.toHaveProperty('report.questions');
});

async function ask(
    board: WorkerBoard,
    delivery: ReturnType<typeof offlineDelivery>['delivery'],
    turnId: string,
    asked: WorkerQuestions = questions,
    attempt = 1
) {
    return await recordComputerTurnQuestion(connection.db, delivery, null, {
        computerId: board.seed.computerId,
        frame: { attempt, questions: asked, turnId, type: 'worker-turn-question' },
        serverId: board.seed.serverId,
    });
}

async function personTurn(
    board: WorkerBoard,
    delivery: ReturnType<typeof offlineDelivery>['delivery']
) {
    const first = await startComputerWorker(connection.db, board);
    await ask(board, delivery, first.turnId);
    await endTurn(connection.db, delivery, board, { exit: 'exited', turnId: first.turnId });
    await answer(board, delivery, {
        nonce: 'person-turn',
        text: 'Pick one for me.',
        workerId: first.workerId,
    });
    const [, next] = await readTurns(connection.db, first.workerId);
    return { turnId: next?.id ?? '', workerId: first.workerId };
}

async function answer(
    board: WorkerBoard,
    delivery: ReturnType<typeof offlineDelivery>['delivery'],
    input: { answersTurnId?: string; nonce: string; text: string; workerId: string }
) {
    const member = await findUserById(connection.db, board.seed.userId);
    if (!member) {
        throw new Error('The seeded person is missing.');
    }
    return await sendPersonFollowUp(
        connection.db,
        member,
        { ...input, serverId: board.seed.serverId },
        delivery
    );
}

async function reportMessages(board: WorkerBoard) {
    return await connection.db
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

async function reportItems(board: WorkerBoard, turnId: string) {
    const rows = await connection.db
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
