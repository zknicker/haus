import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq, sql } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentInboxTable, chatMessagesTable } from '../src/postgres/schema.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { observe, readTurns, seedWorkerBoard, startOn } from './worker-board.fixture.ts';

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

test('a turn that ends without a report fails no-report, posts nothing, and wakes the Agent', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;
    const turnId = worker.turns[0]?.turnId ?? '';

    const settled = await observe(connection.db, delivery, board, {
        result: null,
        status: 'completed',
        turnId,
        workerId: worker.id,
    });

    const [turn] = await readTurns(connection.db, worker.id);
    expect(turn?.outcome).toEqual({ detail: null, kind: 'failed', reason: 'no-report' });
    const posted = await connection.db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.chatId, board.task.chatId));
    expect(posted).toEqual([]);
    const items = await connection.db
        .select({ dedupeKey: agentInboxTable.dedupeKey })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.agentId, board.seed.agentId),
                eq(agentInboxTable.source, 'worker_report')
            )
        );
    expect(items).toEqual([{ dedupeKey: `worker-report:${turnId}` }]);
    expect(settled?.wakes).toEqual([
        { agentId: board.seed.agentId, serverId: board.seed.serverId },
    ]);
});

test('a turn past its place limit waits, and starts when a working turn settles', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    await connection.db.execute(sql`
        insert into worker_place_limits (server_id, place, worker_limit)
        values (${board.seed.serverId}, 'cursor', 1)
    `);
    const running = (await startOn(connection.db, board)).receipt.worker;
    const waiting = (await startOn(connection.db, board)).receipt.worker;
    const waitingTurn = waiting.turns[0]?.turnId;

    const settled = await observe(connection.db, delivery, board, {
        result: { outcome: 'done', personHandle: null, pullRequestUrls: [], text: 'Done.' },
        status: 'completed',
        turnId: running.turns[0]?.turnId ?? '',
        workerId: running.id,
    });

    expect(
        settled?.frames.map(({ frame }) => [frame.type, 'turnId' in frame && frame.turnId])
    ).toEqual([['worker-turn-start', waitingTurn]]);
    const [turn] = await readTurns(connection.db, waiting.id);
    expect(turn?.dispatchedAt).not.toBeNull();
});

test('a stale or repeated settled reading changes nothing', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;
    const turnId = worker.turns[0]?.turnId ?? '';
    const reading = {
        observedAt: '2026-11-19T12:00:00.000Z',
        result: {
            outcome: 'done' as const,
            personHandle: null,
            pullRequestUrls: [],
            text: 'Done.',
        },
        status: 'completed' as const,
        turnId,
        workerId: worker.id,
    };

    await observe(connection.db, delivery, board, reading);
    const again = await observe(connection.db, delivery, board, {
        ...reading,
        observedAt: '2026-11-19T12:01:00.000Z',
    });

    expect(again).toBeNull();
    const posted = await connection.db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.chatId, board.task.chatId));
    expect(posted).toHaveLength(1);
});
