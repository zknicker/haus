import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { workerTurnsTable } from '../src/postgres/schema.ts';
import { planCarrierReconnect } from '../src/workers/carrier-frames.ts';
import { sendAgentFollowUp } from '../src/workers/worker-operations.ts';
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

test('a migrated turn its carrier never journaled settles launch-refused and the next turn dispatches', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;
    await observe(connection.db, delivery, board, {
        result: { outcome: 'done', personHandle: null, pullRequestUrls: [], text: 'Done.' },
        status: 'completed',
        turnId: worker.turns[0]?.turnId ?? '',
        workerId: worker.id,
    });
    const migratedId = createOpaqueId('car');
    await connection.db.insert(workerTurnsTable).values({
        id: migratedId,
        serverId: board.seed.serverId,
        workerId: worker.id,
    });
    const next = await sendAgentFollowUp(connection.db, board.runner, {
        interrupt: false,
        nonce: 'after-migrated',
        text: 'Add the retry test too.',
        workerId: worker.id,
    });
    const reconnect = await planCarrierReconnect(connection.db, {
        id: board.seed.computerId,
        serverId: board.seed.serverId,
    });

    const settled = await observe(connection.db, delivery, board, {
        errorCode: 'turn-not-journaled',
        status: 'failed',
        summary: 'This Computer never accepted the turn, so it never reached the provider.',
        turnId: migratedId,
        workerId: worker.id,
    });

    expect(next.effects.frames).toEqual([]);
    expect(
        reconnect.frames.flatMap(({ frame }) =>
            frame.type === 'worker-reconcile' ? frame.workers.map((entry) => entry.turnId) : []
        )
    ).toEqual([migratedId]);
    const migrated = (await readTurns(connection.db, worker.id)).find(
        (turn) => turn.id === migratedId
    );
    expect(migrated?.outcome).toEqual({
        detail: 'turn-not-journaled',
        kind: 'failed',
        reason: 'launch-refused',
    });
    expect(
        settled?.frames.map(({ frame }) => [frame.type, 'turnId' in frame && frame.turnId])
    ).toEqual([['worker-turn-start', next.receipt.turnId]]);
});
