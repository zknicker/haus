import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { deleteTasksOfRemovedChats } from '../src/tasks/task-chat-removal.ts';
import { acceptWorkerTurn, planCarrierReconnect } from '../src/workers/carrier-frames.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import {
    closeTask,
    observe,
    readTurns,
    seedWorkerBoard,
    setReadyPlaces,
    startOn,
    type WorkerBoard,
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

test('a reconnecting carrier gets every unaccepted start again and reconciles every accepted turn', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const unaccepted = (await startOn(connection.db, board)).receipt.worker;
    const accepted = (await startOn(connection.db, board)).receipt.worker;
    const acceptedTurn = accepted.turns[0]?.turnId ?? '';
    await acceptWorkerTurn(connection.db, { ...scope(board), turnId: acceptedTurn });
    await observe(connection.db, delivery, board, {
        providerAgentId: 'bc_two',
        status: 'running',
        turnId: acceptedTurn,
        workerId: accepted.id,
    });

    const reconnect = await planCarrierReconnect(connection.db, {
        id: board.seed.computerId,
        serverId: board.seed.serverId,
    });

    expect(reconnect.frames.map(({ frame }) => frame.type)).toEqual([
        'worker-turn-start',
        'worker-reconcile',
    ]);
    const [resent, reconcile] = reconnect.frames.map(({ frame }) => frame);
    expect(resent?.type === 'worker-turn-start' && resent.turnId).toBe(unaccepted.turns[0]?.turnId);
    expect(reconcile?.type === 'worker-reconcile' && reconcile.workers).toEqual([
        {
            attempt: 1,
            place: { kind: 'cursor' },
            providerAgentId: 'bc_two',
            providerRunId: null,
            status: 'running',
            stopRequested: false,
            turnId: acceptedTurn,
            workerId: accepted.id,
        },
    ]);
});

test('a Project purge while the carrier is offline stops the hosted run when the carrier reconnects', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;
    const turnId = worker.turns[0]?.turnId ?? '';
    await acceptWorkerTurn(connection.db, { ...scope(board), turnId });
    await observe(connection.db, delivery, board, {
        providerAgentId: 'bc_purged',
        status: 'running',
        turnId,
        workerId: worker.id,
    });
    await setReadyPlaces(connection.db, board.seed.serverId, board.seed.computerId, [], 'offline');

    const purged = await connection.db.transaction(
        async (tx) =>
            await deleteTasksOfRemovedChats(tx, {
                chatIds: [board.task.chatId],
                serverId: board.seed.serverId,
            })
    );
    const reconnect = await planCarrierReconnect(connection.db, {
        id: board.seed.computerId,
        serverId: board.seed.serverId,
    });

    expect(purged.workerFrames).toEqual([]);
    expect((await readTurns(connection.db, worker.id)).map((turn) => turn.outcome)).toEqual([
        { kind: 'stopped' },
    ]);
    expect(
        reconnect.frames.flatMap(({ frame }) =>
            frame.type === 'worker-reconcile' ? frame.workers : []
        )
    ).toEqual([
        {
            attempt: 1,
            place: { kind: 'cursor' },
            providerAgentId: 'bc_purged',
            providerRunId: null,
            status: 'running',
            stopRequested: true,
            turnId,
            workerId: worker.id,
        },
    ]);
});

test('a Task closed while its carrier is offline stops an unaccepted start when the carrier reconnects', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;
    const turnId = worker.turns[0]?.turnId ?? '';
    await setReadyPlaces(connection.db, board.seed.serverId, board.seed.computerId, [], 'offline');

    const closed = await closeTask(connection.db, board, delivery);
    const reconnect = await planCarrierReconnect(connection.db, {
        id: board.seed.computerId,
        serverId: board.seed.serverId,
    });

    expect(closed.workerFrames).toEqual([]);
    expect((await readTurns(connection.db, worker.id)).map((turn) => turn.outcome)).toEqual([
        { kind: 'stopped' },
    ]);
    expect(reconnect.frames.map(({ frame }) => frame)).toEqual([
        {
            type: 'worker-reconcile',
            workers: [
                {
                    attempt: 1,
                    place: { kind: 'cursor' },
                    providerAgentId: null,
                    providerRunId: null,
                    status: 'queued',
                    stopRequested: true,
                    turnId,
                    workerId: worker.id,
                },
            ],
        },
    ]);
});

test('a stop whose frame the carrier missed is reconciled, not started again, on reconnect', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;
    const turnId = worker.turns[0]?.turnId ?? '';

    const closed = await closeTask(connection.db, board, delivery);
    const reconnect = await planCarrierReconnect(connection.db, {
        id: board.seed.computerId,
        serverId: board.seed.serverId,
    });

    expect(closed.workerFrames?.map(({ frame }) => frame.type)).toEqual(['worker-stop']);
    expect((await readTurns(connection.db, worker.id)).map((turn) => turn.outcome)).toEqual([null]);
    expect(reconnect.frames.map(({ frame }) => frame)).toEqual([
        {
            type: 'worker-reconcile',
            workers: [
                {
                    attempt: 1,
                    place: { kind: 'cursor' },
                    providerAgentId: null,
                    providerRunId: null,
                    status: 'queued',
                    stopRequested: true,
                    turnId,
                    workerId: worker.id,
                },
            ],
        },
    ]);
});

function scope(board: WorkerBoard) {
    return { computerId: board.seed.computerId, serverId: board.seed.serverId };
}
