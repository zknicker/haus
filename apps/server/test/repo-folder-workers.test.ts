import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { answerHeldWorkers } from '../src/workers/computer-turn-frames.ts';
import { listWorkerPlaces } from '../src/workers/list-worker-places.ts';
import { requireWorker } from '../src/workers/worker-shape.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { closeTask } from './worker-board.fixture.ts';
import { addRepoFolders, attachAnotherComputer } from './worker-computer-place.fixture.ts';
import {
    computerPlaceBoard,
    endTurn,
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

test('places list the repos each Computer has a folder for', async () => {
    const board = await computerPlaceBoard(connection.db);
    const studio = await attachAnotherComputer(connection.db, board, { name: 'studio' });
    await addRepoFolders(connection.db, board, 'haus/site', [
        { computerId: board.seed.computerId, path: '/Users/ada/src/site' },
    ]);
    await addRepoFolders(connection.db, board, 'haus/haus', [
        { computerId: board.seed.computerId, path: '/Users/ada/src/haus' },
        { computerId: studio, path: '/Volumes/work/haus' },
    ]);

    const listed = await listWorkerPlaces(connection.db, board.runner, undefined);

    expect(
        Object.fromEntries(
            listed.places.flatMap((place) =>
                place.kind === 'computer' ? [[place.name, place.repoFolders]] : []
            )
        )
    ).toEqual({ mini: ['haus/haus', 'haus/site'], studio: ['haus/haus'] });
    expect('repositories' in listed).toBe(false);
});

test("worker-held stores kept worktrees on the Computer's own Workers and clears the rest", async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);
    await endTurn(connection.db, delivery, board, { exit: 'exited', turnId });
    await closeTask(connection.db, board, delivery);
    const other = await attachAnotherComputer(connection.db, board, { name: 'studio' });
    const kept = `/Users/ada/.haus/computer/servers/srv/worktrees/${workerId}/haus/haus`;
    const scope = { computerId: board.seed.computerId, serverId: board.seed.serverId };
    const held = (
        keptWorktrees: Array<{ path: string; workerId: string }>,
        computerId = scope.computerId
    ) =>
        answerHeldWorkers(
            connection.db,
            { ...scope, computerId },
            { keptWorktrees, type: 'worker-held', workerIds: [workerId] }
        );
    const keptOf = async () =>
        (await requireWorker(connection.db, board.seed.serverId, workerId)).keptWorktree;

    expect((await held([{ path: kept, workerId }], other)).events).toEqual([]);
    expect(await keptOf()).toBeNull();

    const stored = await held([{ path: kept, workerId }]);
    expect(stored.events).toHaveLength(1);
    expect(await keptOf()).toBe(kept);
    expect((await held([{ path: kept, workerId }])).events).toEqual([]);

    const cleared = await held([]);
    expect(cleared.events).toHaveLength(1);
    expect(await keptOf()).toBeNull();
});
