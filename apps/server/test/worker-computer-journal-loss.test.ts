import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { acceptWorkerTurn, planCarrierReconnect } from '../src/workers/carrier-frames.ts';
import { sendAgentFollowUp, stopAgentWorker } from '../src/workers/worker-operations.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import type { WorkerBoard } from './worker-board.fixture.ts';
import {
    bringComputerOnline,
    computerPlaceBoard,
    endTurn,
    mintTurnCredential,
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

test('an owed stop whose Computer lost the turn ends it, and the follow-up dispatches', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);
    await acceptWorkerTurn(connection.db, { ...scope(board), attempt: 1, turnId }, null);
    await mintTurnCredential(connection.db, board, turnId);
    await takeComputerOffline(connection.db, board);
    await stopAgentWorker(connection.db, board.runner, workerId, null);
    const followUp = await sendAgentFollowUp(
        connection.db,
        board.runner,
        { interrupt: false, nonce: null, text: 'Now add the test.', workerId },
        null
    );
    await bringComputerOnline(connection.db, board);
    const reconnect = await planCarrierReconnect(
        connection.db,
        { id: board.seed.computerId, serverId: board.seed.serverId },
        null
    );

    const ended = await endTurn(connection.db, delivery, board, {
        attempt: 1,
        detail: 'journal-missing',
        exit: 'uncertain',
        turnId,
    });

    expect(reconnect.frames.map(({ frame }) => frame)).toMatchObject([
        { type: 'worker-reconcile', workers: [{ attempt: 1, stopRequested: true, turnId }] },
    ]);
    const turn = await readTurn(connection.db, turnId);
    expect({ ended: turn?.endedAt !== null, outcome: turn?.outcome }).toEqual({
        ended: true,
        outcome: { kind: 'stopped' },
    });
    expect(
        ended?.frames.map(({ frame }) => frame.type === 'worker-turn-start' && frame.turnId)
    ).toEqual([followUp.receipt.turnId]);
});

test('an acknowledged turn its Computer lost settles failed with the reason', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId } = await startComputerWorker(connection.db, board);
    await acceptWorkerTurn(connection.db, { ...scope(board), attempt: 1, turnId }, null);

    await endTurn(connection.db, delivery, board, {
        attempt: 1,
        detail: 'journal-missing',
        exit: 'uncertain',
        turnId,
    });

    expect((await readTurn(connection.db, turnId))?.outcome).toEqual({
        detail: 'journal-missing',
        kind: 'failed',
        reason: 'no-report',
    });
});

function scope(board: WorkerBoard) {
    return { computerId: board.seed.computerId, serverId: board.seed.serverId };
}
