import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { workerTurnsTable } from '../src/postgres/schema.ts';
import { deleteTasksOfRemovedChats } from '../src/tasks/task-chat-removal.ts';
import {
    acceptWorkerTurn,
    drainWorkerFollowUp,
    planCarrierReconnect,
} from '../src/workers/carrier-frames.ts';
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
            place: 'cursor',
            providerAgentId: 'bc_two',
            providerRunId: null,
            status: 'running',
            stopRequested: false,
            turnId: acceptedTurn,
            workerId: accepted.id,
        },
    ]);
});

test('a drained follow-up fills its Server turn, is acknowledged, and dispatches once its input exists', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;
    await observe(connection.db, delivery, board, {
        result: { outcome: 'done', personHandle: null, pullRequestUrls: [], text: 'Done.' },
        status: 'completed',
        turnId: worker.turns[0]?.turnId ?? '',
        workerId: worker.id,
    });
    const pendingId = createOpaqueId('car');
    await connection.db.insert(workerTurnsTable).values({
        id: pendingId,
        serverId: board.seed.serverId,
        workerId: worker.id,
    });
    const reconnect = await planCarrierReconnect(connection.db, {
        id: board.seed.computerId,
        serverId: board.seed.serverId,
    });
    expect(
        reconnect.frames.flatMap(({ frame: sent }) =>
            sent.type === 'worker-reconcile' ? sent.workers.map((entry) => entry.turnId) : []
        )
    ).toEqual([pendingId]);
    const frame = {
        instructions: 'Add the retry test too.',
        predecessorTurnIds: [worker.turns[0]?.turnId ?? ''],
        providerAgentId: 'bc_drained',
        providerRunId: null,
        turnId: pendingId,
        type: 'worker-follow-up-drain' as const,
        workerId: worker.id,
    };

    const drained = await drainWorkerFollowUp(connection.db, { ...scope(board), frame });
    const again = await drainWorkerFollowUp(connection.db, { ...scope(board), frame });

    expect(
        drained.frames.map(({ frame: sent }) => [sent.type, 'turnId' in sent && sent.turnId])
    ).toEqual([
        ['worker-follow-up-drain-ack', pendingId],
        ['worker-turn-start', pendingId],
    ]);
    expect(again.frames.map(({ frame: sent }) => sent.type)).toEqual([
        'worker-follow-up-drain-ack',
    ]);
    const pending = (await readTurns(connection.db, worker.id)).find(
        (turn) => turn.id === pendingId
    );
    expect(pending?.input?.map(({ author, kind, text }) => ({ author, kind, text }))).toEqual([
        {
            author: { id: board.seed.agentId, kind: 'agent' },
            kind: 'follow-up',
            text: 'Add the retry test too.',
        },
    ]);
    expect(pending?.dispatchedAt).not.toBeNull();
});

test('a drain for a turn the Server never had creates it, and another carrier is not acknowledged', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { worker } = (await startOn(connection.db, board)).receipt;
    const missing = createOpaqueId('car');
    const frame = {
        instructions: 'Recovered from the journal.',
        predecessorTurnIds: [],
        providerAgentId: null,
        providerRunId: 'run_recovered',
        turnId: missing,
        type: 'worker-follow-up-drain' as const,
        workerId: worker.id,
    };

    const elsewhere = await drainWorkerFollowUp(connection.db, {
        computerId: createOpaqueId('cmp'),
        frame,
        serverId: board.seed.serverId,
    });
    const drained = await drainWorkerFollowUp(connection.db, { ...scope(board), frame });

    expect(elsewhere.frames).toEqual([]);
    expect(drained.frames.map(({ frame: sent }) => sent.type)).toEqual([
        'worker-follow-up-drain-ack',
    ]);
    const [created] = await connection.db
        .select()
        .from(workerTurnsTable)
        .where(eq(workerTurnsTable.id, missing));
    expect(created).toMatchObject({ providerRunId: 'run_recovered', workerId: worker.id });
    expect(created?.acknowledgedAt).not.toBeNull();
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
            place: 'cursor',
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
                    place: 'cursor',
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
                    place: 'cursor',
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
