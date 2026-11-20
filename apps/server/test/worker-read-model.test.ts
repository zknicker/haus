import { afterAll, beforeAll, expect, test } from 'bun:test';
import { listServerComputers } from '../src/computers/list-computers.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { listProjects } from '../src/projects/project-read.ts';
import { setProjectDefaultWorkerPlace } from '../src/projects/project-worker-defaults.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { registerTestConnections } from './test-computer-connections.ts';
import { type WorkerBoard, seedWorkerBoard } from './worker-board.fixture.ts';
import {
    addLinkedRepo,
    attachAnotherComputer,
    setComputerPlace,
} from './worker-computer-place.fixture.ts';

let cluster: TestDatabase;
let connection: HausConnection;
const connections = registerTestConnections();

beforeAll(async () => {
    cluster = await startMigratedDatabase();
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

const owner = (board: WorkerBoard) => ({ id: board.seed.userId });

async function readProject(board: WorkerBoard) {
    const projects = await listProjects(connection.db, owner(board), board.seed.serverId);
    const project = projects.find((candidate) => candidate.chatId === board.seed.channelId);
    return { defaultWorkerPlace: project?.defaultWorkerPlace, repos: project?.repos };
}

test('a Project reads its default place with the Computer name and its repos with each link', async () => {
    const board = await seedWorkerBoard(connection.db);
    const computerId = board.seed.computerId;
    await setComputerPlace(connection.db, board, computerId, { name: 'mini' });
    expect(await readProject(board)).toEqual({ defaultWorkerPlace: null, repos: [] });

    const linked = await addLinkedRepo(connection.db, board, 'haus/haus', [
        { checkoutPath: '/Users/person/src/haus', computerId },
    ]);
    const unlinked = await addLinkedRepo(connection.db, board, 'haus/site', []);
    await setProjectDefaultWorkerPlace(connection.db, owner(board), {
        place: { computerId, kind: 'computer' },
        projectId: board.seed.channelId,
        serverId: board.seed.serverId,
    });

    expect(await readProject(board)).toEqual({
        defaultWorkerPlace: { computerId, computerName: 'mini', kind: 'computer' },
        repos: [
            {
                id: linked,
                links: [
                    { checkoutPath: '/Users/person/src/haus', computerId, computerName: 'mini' },
                ],
                repository: 'haus/haus',
            },
            { id: unlinked, links: [], repository: 'haus/site' },
        ],
    });

    await setProjectDefaultWorkerPlace(connection.db, owner(board), {
        place: { kind: 'cursor' },
        projectId: board.seed.channelId,
        serverId: board.seed.serverId,
    });
    expect((await readProject(board)).defaultWorkerPlace).toEqual({ kind: 'cursor' });
});

test("computer.list shows each Computer's switch and limit and whether the viewer may change them", async () => {
    const board = await seedWorkerBoard(connection.db);
    await setComputerPlace(connection.db, board, board.seed.computerId, { limit: 2 });
    const other = await attachAnotherComputer(connection.db, board, { enabled: false });

    const listed = await listServerComputers(
        connection.db,
        connections(),
        owner(board),
        board.seed.serverId
    );
    const workers = Object.fromEntries(
        listed.map(({ canChangeWorkers, id, workerLimit, workersEnabled }) => [
            id,
            { canChangeWorkers, workerLimit, workersEnabled },
        ])
    );

    expect(workers).toEqual({
        [board.seed.computerId]: { canChangeWorkers: true, workerLimit: 2, workersEnabled: true },
        [other]: { canChangeWorkers: true, workerLimit: 4, workersEnabled: false },
    });
});
