import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { WorkerStep } from '@haus/api';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { recordComputerTurnSteps } from '../src/workers/computer-turn-frames.ts';
import { toWorkerTurn } from '../src/workers/worker-shape.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import {
    computerPlaceBoard,
    endTurn,
    readTurn,
    startComputerWorker,
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

const run: WorkerStep = {
    additions: null,
    deletions: null,
    kind: 'run',
    label: 'bun test',
    output: '3 pass',
    state: 'done',
};
const edit: WorkerStep = {
    additions: 4,
    deletions: 1,
    kind: 'edit',
    label: 'src/app.ts',
    output: null,
    state: 'running',
};

test('a Computer turn keeps the steps its current attempt reports until the Computer ends it', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId } = await startComputerWorker(connection.db, board);
    const scope = { computerId: board.seed.computerId, serverId: board.seed.serverId };
    const report = (attempt: number, steps: WorkerStep[]) =>
        recordComputerTurnSteps(connection.db, scope, {
            attempt,
            steps,
            turnId,
            type: 'worker-turn-steps',
        });

    expect(await report(2, [run])).toBeNull();
    expect((await readTurn(connection.db, turnId))?.steps).toBeNull();

    expect(await report(1, [run])).not.toBeNull();
    expect(await report(1, [run, edit])).not.toBeNull();
    const turn = await readTurn(connection.db, turnId);
    expect(turn && toWorkerTurn(turn).steps).toEqual([run, edit]);

    await endTurn(connection.db, delivery, board, { exit: 'exited', turnId });
    expect(await report(1, [edit])).toBeNull();
    expect((await readTurn(connection.db, turnId))?.steps).toEqual([run, edit]);
});
