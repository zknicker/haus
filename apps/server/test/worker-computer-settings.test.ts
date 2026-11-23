import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { removeServerComputer } from '../src/computers/remove-computer.ts';
import { setComputerWorkers } from '../src/computers/set-computer-workers.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { projectsTable, serverMembershipsTable, usersTable } from '../src/postgres/schema.ts';
import { setProjectDefaultWorkerPlace } from '../src/projects/project-worker-defaults.ts';
import { sendAgentFollowUp } from '../src/workers/worker-operations.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { type WorkerBoard, readTurns, seedWorkerBoard, startOn } from './worker-board.fixture.ts';
import { attachAnotherComputer, setComputerPlace } from './worker-computer-place.fixture.ts';

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

async function computerBoard(limit = 1) {
    const board = await seedWorkerBoard(connection.db);
    await setComputerPlace(connection.db, board, board.seed.computerId, { limit, name: 'mini' });
    return { board };
}

const owner = (board: WorkerBoard) => ({ id: board.seed.userId });

test('switching Workers off refuses new work, settles queued turns place-off, lets working turns finish, and clears defaults', async () => {
    const { board } = await computerBoard();
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const place = { computerId: board.seed.computerId, kind: 'computer' } as const;
    await setProjectDefaultWorkerPlace(connection.db, owner(board), {
        place,
        projectId: board.seed.channelId,
        serverId: board.seed.serverId,
    });
    const working = (await startOn(connection.db, board, { place: 'mini' })).receipt.worker;
    const queued = (await startOn(connection.db, board, { place: 'mini' })).receipt.worker;

    const off = await setComputerWorkers(
        connection.db,
        delivery,
        owner(board),
        { computerId: board.seed.computerId, enabled: false, serverId: board.seed.serverId },
        null
    );

    expect(off.projectIds).toEqual([board.seed.channelId]);
    expect((await readTurns(connection.db, queued.id)).map((turn) => turn.outcome)).toEqual([
        { detail: null, kind: 'failed', reason: 'place-off' },
    ]);
    expect((await readTurns(connection.db, working.id)).map((turn) => turn.outcome)).toEqual([
        null,
    ]);
    expect(await readDefault(board)).toEqual({ computerId: null, place: null });
    await expect(startOn(connection.db, board, { place: 'mini' })).rejects.toThrow(
        'its "Run Workers here" setting is Off'
    );
    await expect(
        sendAgentFollowUp(
            connection.db,
            board.runner,
            { interrupt: false, nonce: 'off', text: 'More.', workerId: queued.id },
            null
        )
    ).rejects.toThrow('its "Run Workers here" setting is Off');
});

test('a Computer default needs the switch on, and removing the Computer clears it first', async () => {
    const { board } = await computerBoard();
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const other = await attachAnotherComputer(connection.db, board, { enabled: false });
    const input = {
        place: { computerId: other, kind: 'computer' as const },
        projectId: board.seed.channelId,
        serverId: board.seed.serverId,
    };
    await expect(setProjectDefaultWorkerPlace(connection.db, owner(board), input)).rejects.toThrow(
        'Turn on "Run Workers here" for that Computer'
    );
    await setComputerPlace(connection.db, board, other, { enabled: true });
    await setProjectDefaultWorkerPlace(connection.db, owner(board), input);
    expect(await readDefault(board)).toEqual({ computerId: other, place: 'computer' });

    const removed = await removeServerComputer(
        connection.db,
        delivery,
        owner(board),
        { computerId: other, confirmation: 'REMOVE', serverId: board.seed.serverId },
        null
    );

    expect(removed.projectIds).toEqual([board.seed.channelId]);
    expect(await readDefault(board)).toEqual({ computerId: null, place: null });
});

test("only the attacher, an Owner, or an Admin sets a Computer's switch", async () => {
    const { board } = await computerBoard();
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const member = await addMember(board, 'member');
    const attached = await attachAnotherComputer(connection.db, board);
    await connection.db.execute(
        sql`update computers set attached_by_user_id = ${member} where id = ${attached}`
    );
    const denied = 'Only the person who attached this Computer, an Owner, or an Admin';

    await expect(
        setComputerWorkers(
            connection.db,
            delivery,
            { id: member },
            { computerId: board.seed.computerId, enabled: true, serverId: board.seed.serverId },
            null
        )
    ).rejects.toThrow(denied);
    expect(
        await setComputerWorkers(
            connection.db,
            delivery,
            { id: member },
            { computerId: attached, enabled: true, limit: 2, serverId: board.seed.serverId },
            null
        )
    ).toMatchObject({ computerId: attached });
});

async function readDefault(board: WorkerBoard) {
    const [row] = await connection.db
        .select({
            computerId: projectsTable.defaultWorkerComputerId,
            place: projectsTable.defaultWorkerPlace,
        })
        .from(projectsTable)
        .where(eq(projectsTable.chatId, board.seed.channelId));
    return row;
}

async function addMember(board: WorkerBoard, role: 'member') {
    const userId = createOpaqueId('usr');
    await connection.db
        .insert(usersTable)
        .values({ authSubject: createOpaqueId('clk'), id: userId });
    await connection.db.insert(serverMembershipsTable).values({
        handle: `member-${crypto.randomUUID().slice(0, 6)}`,
        id: createOpaqueId('mem'),
        role,
        serverId: board.seed.serverId,
        userId,
    });
    await connection.db.execute(
        sql`insert into channel_participants (server_id, chat_id, user_id)
            values (${board.seed.serverId}, ${board.seed.channelId}, ${userId})`
    );
    return userId;
}
