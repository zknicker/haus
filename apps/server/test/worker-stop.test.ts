import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentInboxTable, workerTurnsTable, workersTable } from '../src/postgres/schema.ts';
import { listComputerWorker } from '../src/workers/list-computer-worker.ts';
import {
    sendAgentFollowUp,
    stopAgentWorker,
    stopWorkerAsPerson,
} from '../src/workers/worker-operations.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { addPeerAgent } from './task-delivery-fixture.ts';
import {
    observe,
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

test('stop asks the carrier to end a working turn and drops its queued follow-ups at once', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;
    const working = worker.turns[0]?.turnId ?? '';
    await observe(connection.db, delivery, board, {
        providerAgentId: 'bc_one',
        status: 'running',
        turnId: working,
        workerId: worker.id,
    });
    const followUp = await sendAgentFollowUp(connection.db, board.runner, {
        interrupt: false,
        nonce: 'follow-1',
        text: 'Also cover the retry path.',
        workerId: worker.id,
    });

    const stopped = await stopAgentWorker(connection.db, board.runner, worker.id);

    expect(stopped.effects.frames).toEqual([
        {
            computerId: board.seed.computerId,
            frame: {
                place: 'cursor',
                providerAgentId: 'bc_one',
                providerRunId: null,
                turnId: working,
                type: 'worker-stop',
                workerId: worker.id,
            },
        },
    ]);
    const turns = await readTurns(connection.db, worker.id);
    expect(
        turns.map((turn) => [turn.id, turn.status, turn.outcome, turn.stopRequestedByAgentId])
    ).toEqual([
        [working, 'running', null, board.seed.agentId],
        [followUp.receipt.turnId, 'cancelled', { kind: 'stopped' }, board.seed.agentId],
    ]);
    expect(stopped.worker.status).toBe('stopped');

    const settled = await observe(connection.db, delivery, board, {
        status: 'cancelled',
        turnId: working,
        workerId: worker.id,
    });
    expect(settled?.wakes).toEqual([]);
    expect((await readTurns(connection.db, worker.id))[0]?.outcome).toEqual({ kind: 'stopped' });
    expect(await queuedReportCount(board.seed.agentId)).toBe(0);
});

test('a stop while the carrier is offline settles on the Server, and reconnect still stops it', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;
    const turnId = worker.turns[0]?.turnId ?? '';
    await observe(connection.db, delivery, board, {
        status: 'running',
        turnId,
        workerId: worker.id,
    });
    await acknowledge(turnId);
    await setReadyPlaces(
        connection.db,
        board.seed.serverId,
        board.seed.computerId,
        ['cursor'],
        'offline'
    );

    const stopped = await stopWorkerAsPerson(connection.db, {
        serverId: board.seed.serverId,
        userId: board.seed.userId,
        workerId: worker.id,
    });

    expect(stopped.effects.frames).toEqual([]);
    expect(stopped.worker.status).toBe('stopped');
    expect(stopped.worker.turns[0]?.stopRequestedBy).toEqual({
        id: board.seed.userId,
        kind: 'user',
    });
    expect(
        await listComputerWorker(connection.db, {
            computerId: board.seed.computerId,
            serverId: board.seed.serverId,
        })
    ).toEqual([
        {
            place: 'cursor',
            providerAgentId: null,
            providerRunId: null,
            status: 'running',
            stopRequested: true,
            turnId,
            workerId: worker.id,
        },
    ]);
});

test('only the delegating Agent stops its Worker, and a Worker with nothing live refuses', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;
    const peer = await addPeerAgent(connection.db, board.seed);

    await expect(
        stopAgentWorker(connection.db, { ...board.runner, agentId: peer }, worker.id)
    ).rejects.toThrow('Only the Agent that started this Worker');
    await observe(connection.db, delivery, board, {
        result: { outcome: 'done', personHandle: null, pullRequestUrls: [], text: 'Done.' },
        status: 'completed',
        turnId: worker.turns[0]?.turnId ?? '',
        workerId: worker.id,
    });
    await expect(stopAgentWorker(connection.db, board.runner, worker.id)).rejects.toThrow(
        'That Worker has no queued or working turn to stop.'
    );
});

test('read-only history refuses every write', async () => {
    const board = await seedWorkerBoard(connection.db);
    const workerId = createOpaqueId('caw');
    await connection.db.insert(workersTable).values({
        agentId: board.seed.agentId,
        carrierComputerId: board.seed.computerId,
        closedAt: new Date(),
        id: workerId,
        place: 'cursor',
        repository: 'haus/haus',
        serverId: board.seed.serverId,
        title: 'Before Tasks',
    });
    const readOnly = 'That Worker is read-only history from before Tasks.';

    await expect(stopAgentWorker(connection.db, board.runner, workerId)).rejects.toThrow(readOnly);
    await expect(
        sendAgentFollowUp(connection.db, board.runner, {
            interrupt: false,
            nonce: 'history',
            text: 'Try again.',
            workerId,
        })
    ).rejects.toThrow(readOnly);
});

async function acknowledge(turnId: string) {
    await connection.db
        .update(workerTurnsTable)
        .set({ acknowledgedAt: new Date() })
        .where(eq(workerTurnsTable.id, turnId));
}

async function queuedReportCount(agentId: string) {
    const rows = await connection.db
        .select({ id: agentInboxTable.id })
        .from(agentInboxTable)
        .where(
            and(eq(agentInboxTable.agentId, agentId), eq(agentInboxTable.source, 'worker_report'))
        );
    return rows.length;
}
