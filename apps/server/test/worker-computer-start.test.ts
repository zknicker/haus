import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    computerAgentAccessTable,
    computersTable,
    projectsTable,
    serverMembershipsTable,
    workersTable,
} from '../src/postgres/schema.ts';
import { WorkerPlaceNoAccessError } from '../src/workers/place-errors.ts';
import { startWorker } from '../src/workers/start-worker.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import {
    type WorkerBoard,
    observe,
    readTurns,
    seedWorkerBoard,
    startInput,
    startOn,
} from './worker-board.fixture.ts';
import {
    addRepoFolders,
    attachAnotherComputer,
    readServerRepositories,
    setComputerPlace,
} from './worker-computer-place.fixture.ts';

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

async function computerBoard() {
    const board = await seedWorkerBoard(connection.db);
    await setComputerPlace(connection.db, board, board.seed.computerId, { name: 'mini' });
    await addRepoFolders(connection.db, board, 'haus/haus', [
        { computerId: board.seed.computerId, path: '/Users/zach/haus' },
    ]);
    return board;
}

test("a start on a Computer by name runs its first ready runtime in a worktree of the Computer's folder", async () => {
    const board = await computerBoard();

    const started = await startOn(connection.db, board, { model: 'opus', place: 'mini' });

    const { worker } = started.receipt;
    expect([worker.place, worker.runtime, worker.model, worker.repository]).toEqual([
        { computerId: board.seed.computerId, computerName: 'mini', kind: 'computer' },
        'claude-code',
        'opus',
        'haus/haus',
    ]);
    const [sent] = started.effects.frames;
    expect(sent?.computerId).toBe(board.seed.computerId);
    expect(sent?.frame).toMatchObject({
        attempt: 1,
        checkout: {
            branch: `haus/${worker.id}/${board.task.key.toLowerCase()}`,
            checkoutPath: '/Users/zach/haus',
            repository: 'haus/haus',
            startingRef: 'main',
        },
        model: { id: 'opus' },
        place: { computerId: board.seed.computerId, kind: 'computer' },
        resumeSessionId: null,
        runtime: 'claude-code',
        workerMdRevisionId: null,
    });
    expect(sent?.frame.type === 'worker-turn-start' && sent.frame.input).toContain(
        'pipe its text to `haus worker report --outcome done|needs-you|failed`'
    );
    const again = await startOn(connection.db, board, {
        place: `computer:${board.seed.computerId}`,
    });
    expect(again.receipt.worker.place).toMatchObject({ computerId: board.seed.computerId });
});

test('every unusable Computer start refuses with its reason and writes nothing', async () => {
    const board = await computerBoard();
    const refuse = (overrides: Parameters<typeof startInput>[1]) =>
        startWorker(connection.db, board.runner, startInput(board, overrides), null);
    const { computerId } = board.seed;

    await expect(refuse({ place: 'mini', runtime: 'codex' })).rejects.toThrow(
        'codex is not ready on mini.'
    );
    await expect(refuse({ place: 'cursor', runtime: 'codex' })).rejects.toThrow(
        '--runtime and --model are for Computer places'
    );
    await expect(refuse({ place: 'nowhere' })).rejects.toThrow('No place is named nowhere.');
    await setComputerPlace(connection.db, board, computerId, { ready: [] });
    await expect(refuse({ place: 'mini' })).rejects.toThrow('No Worker runtime is ready on mini.');
    await setComputerPlace(connection.db, board, computerId, { health: 'offline' });
    await expect(refuse({ place: 'mini' })).rejects.toThrow('mini is offline');
    await setComputerPlace(connection.db, board, computerId, { enabled: false });
    await expect(refuse({ place: 'mini' })).rejects.toThrow(
        'Workers can\'t run on mini: its "Run Workers here" setting is Off.'
    );
    await connection.db
        .update(projectsTable)
        .set({ defaultWorkerComputerId: computerId, defaultWorkerPlace: 'computer' })
        .where(eq(projectsTable.chatId, board.seed.channelId));
    await expect(refuse({ place: undefined })).rejects.toThrow(
        `This Task's Project runs Workers on computer:${computerId}, which can't take one now.`
    );
    expect(await countWorkers(board)).toBe(0);
    expect(await readServerRepositories(connection.db, board)).toEqual(['haus/haus']);
});

test('two Computers that share a name refuse the bare name and list their id forms', async () => {
    const board = await computerBoard();
    const other = await attachAnotherComputer(connection.db, board, { name: 'Mini' });

    await expect(
        startWorker(connection.db, board.runner, startInput(board, { place: 'mini' }), null)
    ).rejects.toThrow(
        `More than one Computer is named mini. Name one by id: computer:${board.seed.computerId}, computer:${other}.`
    );
    const byId = await startOn(connection.db, board, {
        place: `computer:${board.seed.computerId}`,
    });
    expect(byId.receipt.worker.carrierComputerId).toBe(board.seed.computerId);
});

test('a Computer place takes a repo it has no folder for, and the start frame clones it', async () => {
    const board = await computerBoard();

    const started = await startOn(connection.db, board, {
        place: 'mini',
        repository: 'haus/docs',
    });

    expect(started.receipt.worker.repository).toBe('haus/docs');
    expect(started.effects.frames[0]?.frame).toMatchObject({
        checkout: { checkoutPath: null, repository: 'haus/docs' },
    });
    expect(await readServerRepositories(connection.db, board)).toEqual(['haus/haus']);
});

test('a cloud start adds its repo once the provider starts it, and a refused start adds nothing', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);

    await expect(
        startWorker(
            connection.db,
            board.runner,
            startInput(board, { place: 'cursor', repository: 'haus/typo', runtime: 'codex' }),
            null
        )
    ).rejects.toThrow('--runtime and --model are for Computer places');
    const started = await startOn(connection.db, board, { repository: 'haus/docs' });
    const [turn] = await readTurns(connection.db, started.receipt.worker.id);
    expect(await readServerRepositories(connection.db, board)).toEqual([]);

    await observe(connection.db, delivery, board, {
        providerAgentId: 'bc-1',
        status: 'running',
        turnId: turn?.id ?? '',
        workerId: started.receipt.worker.id,
    });

    expect(await readServerRepositories(connection.db, board)).toEqual(['haus/docs']);
});

test("a start without --on uses the Project's Computer default before the Agent's cloud default", async () => {
    const board = await computerBoard();
    await connection.db
        .update(projectsTable)
        .set({ defaultWorkerComputerId: board.seed.computerId, defaultWorkerPlace: 'computer' })
        .where(eq(projectsTable.chatId, board.seed.channelId));

    const started = await startOn(connection.db, board, { place: undefined });

    expect(started.receipt.worker.place.kind).toBe('computer');
});

test('a Captain starts a Worker on another Computer only where Agent access allows it', async () => {
    const board = await computerBoard();
    const studio = await attachAnotherComputer(connection.db, board, { name: 'studio' });
    await connection.db
        .update(serverMembershipsTable)
        .set({ handle: 'ada' })
        .where(eq(serverMembershipsTable.userId, board.seed.userId));

    const refused = startWorker(
        connection.db,
        board.runner,
        startInput(board, { place: 'studio' }),
        null
    );
    await expect(refused).rejects.toBeInstanceOf(WorkerPlaceNoAccessError);
    await expect(refused).rejects.toThrow(
        "You don't have access to studio, so no Worker started there. Only @ada can give you access"
    );
    await connection.db
        .update(projectsTable)
        .set({ defaultWorkerComputerId: studio, defaultWorkerPlace: 'computer' })
        .where(eq(projectsTable.chatId, board.seed.channelId));
    await expect(
        startWorker(connection.db, board.runner, startInput(board, { place: undefined }), null)
    ).rejects.toBeInstanceOf(WorkerPlaceNoAccessError);
    expect(await countWorkers(board)).toBe(0);

    await connection.db
        .update(computersTable)
        .set({ agentAccessScope: 'all' })
        .where(eq(computersTable.id, studio));
    expect((await startOn(connection.db, board, { place: 'studio' })).receipt.state).toBe(
        'started'
    );
    await connection.db
        .update(computersTable)
        .set({ agentAccessScope: 'selected' })
        .where(eq(computersTable.id, studio));
    await grantAccess(board, studio);
    expect((await startOn(connection.db, board, { place: 'studio' })).receipt.state).toBe(
        'started'
    );
});

test('a Computer past its own Worker limit queues while another Computer still starts', async () => {
    const board = await computerBoard();
    await setComputerPlace(connection.db, board, board.seed.computerId, { limit: 1 });
    const studio = await attachAnotherComputer(connection.db, board, { name: 'studio' });
    await grantAccess(board, studio);

    const first = await startOn(connection.db, board, { place: 'mini' });
    const second = await startOn(connection.db, board, { place: 'mini' });
    const elsewhere = await startOn(connection.db, board, { place: 'studio' });

    expect([first.receipt.state, second.receipt.state, elsewhere.receipt.state]).toEqual([
        'started',
        'queued',
        'started',
    ]);
});

async function grantAccess(board: WorkerBoard, computerId: string) {
    await connection.db.insert(computerAgentAccessTable).values({
        agentId: board.seed.agentId,
        computerId,
        grantedByUserId: board.seed.userId,
        serverId: board.seed.serverId,
    });
}

async function countWorkers(board: WorkerBoard) {
    const rows = await connection.db
        .select({ id: workersTable.id })
        .from(workersTable)
        .where(eq(workersTable.serverId, board.seed.serverId));
    return rows.length;
}
