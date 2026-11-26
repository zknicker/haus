import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentInboxTable, workersTable } from '../src/postgres/schema.ts';
import { sendAgentFollowUp } from '../src/workers/worker-operations.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import {
    closeTask,
    observe,
    readTaskState,
    readTurns,
    seedWorkerBoard,
    setReadyPlaces,
    startOn,
} from './worker-board.fixture.ts';

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

test('archiving a Task stops a working Worker, delivers its outcome once it settles, then closes it', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;
    const working = worker.turns[0]?.turnId ?? '';
    await observe(connection.db, delivery, board, {
        status: 'running',
        turnId: working,
        workerId: worker.id,
    });
    const queued = await sendAgentFollowUp(connection.db, board.runner, {
        interrupt: false,
        nonce: 'before-close',
        text: 'One more thing.',
        workerId: worker.id,
    });

    const closed = await closeTask(connection.db, board, delivery);

    expect(
        closed.workerFrames?.map(({ frame }) => [frame.type, 'turnId' in frame && frame.turnId])
    ).toEqual([['worker-stop', working]]);
    expect(await readClosing(worker.id)).toEqual({ closed: false, closing: true });
    expect((await readTurns(connection.db, worker.id)).map((turn) => turn.outcome)).toEqual([
        null,
        { kind: 'stopped' },
    ]);
    await expect(
        sendAgentFollowUp(connection.db, board.runner, {
            interrupt: false,
            nonce: 'after-close',
            text: 'Too late.',
            workerId: worker.id,
        })
    ).rejects.toThrow('That Worker closed with its Task');
    expect(await reportItems(board.seed.agentId)).toEqual([]);

    await observe(connection.db, delivery, board, {
        result: {
            outcome: 'done',
            personHandle: null,
            pullRequestUrls: [],
            text: 'Finished first.',
        },
        status: 'completed',
        turnId: working,
        workerId: worker.id,
    });

    expect(await reportItems(board.seed.agentId)).toEqual([`worker-report:${working}`]);
    expect(await readClosing(worker.id)).toEqual({ closed: true, closing: true });
    expect(queued.receipt.turnId).not.toBe(working);
    expect((await readTaskState(connection.db, board.task.id))?.archivedAt).not.toBeNull();
});

test('archiving a Task with an offline carrier settles its Worker stopped and delivers that outcome', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;
    const turnId = worker.turns[0]?.turnId ?? '';
    await setReadyPlaces(
        connection.db,
        board.seed.serverId,
        board.seed.computerId,
        ['cursor'],
        'offline'
    );

    const closed = await closeTask(connection.db, board, delivery);

    expect(closed.workerFrames).toEqual([]);
    expect(closed.wakes).toEqual([{ agentId: board.seed.agentId, serverId: board.seed.serverId }]);
    expect((await readTurns(connection.db, worker.id))[0]?.outcome).toEqual({ kind: 'stopped' });
    expect(await reportItems(board.seed.agentId)).toEqual([`worker-report:${turnId}`]);
    expect(await readClosing(worker.id)).toEqual({ closed: true, closing: true });
});

test('archiving a Task leaves an idle Worker closed without a second report', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;
    await observe(connection.db, delivery, board, {
        result: { outcome: 'done', personHandle: null, pullRequestUrls: [], text: 'Done.' },
        status: 'completed',
        turnId: worker.turns[0]?.turnId ?? '',
        workerId: worker.id,
    });

    const closed = await closeTask(connection.db, board, delivery);

    expect(closed.workerFrames).toEqual([]);
    expect(await reportItems(board.seed.agentId)).toHaveLength(1);
    expect(await readClosing(worker.id)).toEqual({ closed: true, closing: true });
});

async function readClosing(workerId: string) {
    const [row] = await connection.db
        .select({ closedAt: workersTable.closedAt, closingAt: workersTable.closingAt })
        .from(workersTable)
        .where(eq(workersTable.id, workerId));
    return { closed: row?.closedAt !== null, closing: row?.closingAt !== null };
}

async function reportItems(agentId: string) {
    const rows = await connection.db
        .select({ dedupeKey: agentInboxTable.dedupeKey })
        .from(agentInboxTable)
        .where(
            and(eq(agentInboxTable.agentId, agentId), eq(agentInboxTable.source, 'worker_report'))
        );
    return rows.map((row) => row.dedupeKey);
}
