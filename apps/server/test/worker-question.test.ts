import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { failOfflineComputerTurns } from '../src/workers/fail-offline-computer-turns.ts';
import { requireWorker } from '../src/workers/worker-shape.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { observe, startOn } from './worker-board.fixture.ts';
import {
    bringComputerOnline,
    computerPlaceBoard,
    endTurn,
    readTurn,
    startComputerWorker,
    takeComputerOffline,
} from './worker-computer-turn.fixture.ts';
import {
    answer,
    ask,
    personTurn,
    questions,
    questionsText,
    reportItems,
    reportMessages,
} from './worker-question.fixture.ts';

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

test('a question settles the turn needs-you at once, posts once, and wakes the Agent it is for', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);

    await ask(connection.db, board, delivery, turnId);

    const turn = await readTurn(connection.db, turnId);
    expect(turn?.outcome).toMatchObject({
        kind: 'report',
        report: {
            ask: 'Which database should I use?',
            outcome: 'needs-you',
            personId: null,
            questions,
            source: 'worker',
            text: questionsText,
        },
    });
    const messages = await reportMessages(connection.db, board);
    expect(messages.map((message) => message.content)).toEqual([questionsText]);
    expect(await reportItems(connection.db, board, turnId)).toEqual(['worker_report']);
    expect((await requireWorker(connection.db, board.seed.serverId, workerId)).status).toBe(
        'needs-you'
    );

    await ask(connection.db, board, delivery, turnId, [{ ...questions[0], question: 'Again?' }]);
    expect((await readTurn(connection.db, turnId))?.outcome).toEqual(turn?.outcome ?? null);
    expect(await reportMessages(connection.db, board)).toHaveLength(1);
});

test('a question in a turn a person started @mentions them and does not wake the Agent', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const asking = await personTurn(connection.db, board, delivery);

    await ask(connection.db, board, delivery, asking.turnId);

    expect((await readTurn(connection.db, asking.turnId))?.outcome).toMatchObject({
        report: { personId: board.seed.userId, questions },
    });
    const [, posted] = await reportMessages(connection.db, board);
    expect(posted?.mentionedUserIds).toEqual([board.seed.userId]);
    expect(await reportItems(connection.db, board, asking.turnId)).toEqual([]);
});

test('a captured question outlives the process and the Computer going offline', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId } = await startComputerWorker(connection.db, board);
    await ask(connection.db, board, delivery, turnId);
    const asked = (await readTurn(connection.db, turnId))?.outcome;

    await takeComputerOffline(connection.db, board);
    await failOfflineComputerTurns(connection.db, delivery, new Date(Date.now() + 3_600_000));
    await endTurn(connection.db, delivery, board, { exit: 'uncertain', turnId });

    const turn = await readTurn(connection.db, turnId);
    expect(turn?.outcome).toEqual(asked ?? null);
    expect(turn?.endedAt).not.toBeNull();
});

test('a question replayed after an offline failure replaces it, unless a later turn moved on', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId } = await startComputerWorker(connection.db, board);
    await takeComputerOffline(connection.db, board);
    await failOfflineComputerTurns(connection.db, delivery, new Date(Date.now() + 3_600_000));
    expect((await readTurn(connection.db, turnId))?.outcome).toMatchObject({
        reason: 'machine-offline',
    });

    await ask(connection.db, board, delivery, turnId);

    expect((await readTurn(connection.db, turnId))?.outcome).toMatchObject({
        report: { outcome: 'needs-you', questions },
    });
    expect(await reportItems(connection.db, board, turnId)).toEqual(['worker_report']);
    expect(await reportMessages(connection.db, board)).toHaveLength(1);

    await bringComputerOnline(connection.db, board);
    const moved = await personTurn(connection.db, board, delivery);
    await takeComputerOffline(connection.db, board);
    await failOfflineComputerTurns(connection.db, delivery, new Date(Date.now() + 3_600_000));
    const failed = (await readTurn(connection.db, moved.turnId))?.outcome;
    expect(failed).toMatchObject({ reason: 'machine-offline' });
    await answer(connection.db, board, delivery, {
        nonce: 'moved-on',
        text: 'Never mind, use Postgres.',
        workerId: moved.workerId,
    });
    await ask(connection.db, board, delivery, moved.turnId);
    expect((await readTurn(connection.db, moved.turnId))?.outcome).toEqual(failed ?? null);
});

test('a stale attempt asks nothing', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId } = await startComputerWorker(connection.db, board);

    await ask(connection.db, board, delivery, turnId, questions, 7);

    expect((await readTurn(connection.db, turnId))?.outcome).toBeNull();
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
            text: questionsText,
        },
    });
    expect(settled[1]).toMatchObject({
        report: { outcome: 'needs-you', text: 'Claude is asking to use WebFetch.' },
    });
    expect(settled[1]).not.toHaveProperty('report.questions');
});
