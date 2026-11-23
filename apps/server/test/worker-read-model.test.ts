import { afterAll, beforeAll, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { listServerComputers } from '../src/computers/list-computers.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { serverMembershipsTable, usersTable } from '../src/postgres/schema.ts';
import { listProjects } from '../src/projects/project-read.ts';
import { setProjectDefaultWorkerPlace } from '../src/projects/project-worker-defaults.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { registerTestConnections } from './test-computer-connections.ts';
import { type WorkerBoard, seedWorkerBoard } from './worker-board.fixture.ts';
import { attachAnotherComputer, setComputerPlace } from './worker-computer-place.fixture.ts';

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
    return {
        defaultWorkerPlace: project?.defaultWorkerPlace,
        repos: project && 'repos' in project,
    };
}

test('a Project reads its default place with the Computer name and carries no repos', async () => {
    const board = await seedWorkerBoard(connection.db);
    const computerId = board.seed.computerId;
    await setComputerPlace(connection.db, board, computerId, { name: 'mini' });
    expect(await readProject(board)).toEqual({ defaultWorkerPlace: null, repos: false });

    await setProjectDefaultWorkerPlace(connection.db, owner(board), {
        place: { computerId, kind: 'computer' },
        projectId: board.seed.channelId,
        serverId: board.seed.serverId,
    });

    expect(await readProject(board)).toEqual({
        defaultWorkerPlace: { computerId, computerName: 'mini', kind: 'computer' },
        repos: false,
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

test('computer.list shows a plain member only the Computers they attached, and an Owner every one', async () => {
    const board = await seedWorkerBoard(connection.db);
    await setComputerPlace(connection.db, board, board.seed.computerId, { name: 'mini' });
    const studio = await attachAnotherComputer(connection.db, board, { name: 'studio' });
    const attacher = await addMember(board);
    const bystander = await addMember(board);
    await connection.db.execute(
        sql`update computers set attached_by_user_id = ${attacher} where id = ${studio}`
    );
    const rows = async (userId: string) =>
        (
            await listServerComputers(
                connection.db,
                connections(),
                { id: userId },
                board.seed.serverId
            )
        ).map(({ attachedByCurrentUser, canChangeWorkers, id, name, workersEnabled }) => ({
            attachedByCurrentUser,
            canChangeWorkers,
            id,
            name,
            workersEnabled,
        }));
    const studioRow = {
        canChangeWorkers: true,
        id: studio,
        name: 'studio',
        workersEnabled: true,
    };

    expect(await rows(bystander)).toEqual([]);
    expect(await rows(attacher)).toEqual([{ ...studioRow, attachedByCurrentUser: true }]);
    expect(await rows(board.seed.userId)).toEqual([
        { ...studioRow, attachedByCurrentUser: false },
        {
            attachedByCurrentUser: true,
            canChangeWorkers: true,
            id: board.seed.computerId,
            name: 'mini',
            workersEnabled: true,
        },
    ]);
});

async function addMember(board: WorkerBoard) {
    const userId = createOpaqueId('usr');
    await connection.db
        .insert(usersTable)
        .values({ authSubject: createOpaqueId('clk'), id: userId });
    await connection.db.insert(serverMembershipsTable).values({
        handle: `member-${crypto.randomUUID().slice(0, 6)}`,
        id: createOpaqueId('mem'),
        role: 'member',
        serverId: board.seed.serverId,
        userId,
    });
    return userId;
}
