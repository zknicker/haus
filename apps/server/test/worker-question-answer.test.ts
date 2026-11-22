import { afterAll, beforeAll, expect, test } from 'bun:test';
import { workerAnswersText } from '@haus/api';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { WorkerClosedError, WorkerQuestionClosedError } from '../src/workers/errors.ts';
import {
    dismissWorkerQuestion,
    sendAgentFollowUp,
    stopWorkerAsPerson,
} from '../src/workers/worker-operations.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { closeTask, readTurns } from './worker-board.fixture.ts';
import {
    computerPlaceBoard,
    endTurn,
    readTurn,
    startComputerWorker,
} from './worker-computer-turn.fixture.ts';
import { answer, ask, questions } from './worker-question.fixture.ts';

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

test('the first answer wins, and a later answer hears who answered', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);
    await ask(connection.db, board, delivery, turnId);
    await endTurn(connection.db, delivery, board, { exit: 'exited', turnId });
    const text = workerAnswersText(questions, [{ labels: ['Postgres'], text: null }]);

    await answer(connection.db, board, delivery, {
        answersTurnId: turnId,
        nonce: 'a-1',
        text,
        workerId,
    });
    const refused = answer(connection.db, board, delivery, {
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
    await ask(connection.db, board, delivery, turnId);
    await endTurn(connection.db, delivery, board, { exit: 'exited', turnId });

    await sendAgentFollowUp(
        connection.db,
        board.runner,
        { interrupt: false, nonce: 'agent-answer', text: 'Use Postgres.', workerId },
        null
    );
    const refused = answer(connection.db, board, delivery, {
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
    await ask(connection.db, board, delivery, turnId);
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
    await ask(connection.db, board, delivery, turnId);

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
        answer(connection.db, board, delivery, {
            answersTurnId: turnId,
            nonce: 'closed',
            text: 'Postgres',
            workerId,
        })
    ).rejects.toBeInstanceOf(WorkerClosedError);
});
