import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { projectsTable, workersTable } from '../src/postgres/schema.ts';
import { startWorker } from '../src/workers/start-worker.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { type WorkerBoard, seedWorkerBoard, startInput, startOn } from './worker-board.fixture.ts';
import {
    addLinkedRepo,
    attachAnotherComputer,
    readProjectRepositories,
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
    await addLinkedRepo(connection.db, board, 'haus/haus', [
        { checkoutPath: '/Users/zach/haus', computerId: board.seed.computerId },
    ]);
    return board;
}

test('a start on a Computer by name runs its first ready runtime in a worktree of the linked clone', async () => {
    const board = await computerBoard();

    const started = await startOn(connection.db, board, {
        model: 'opus',
        place: 'mini',
        repository: undefined,
    });

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
    await expect(refuse({ place: 'mini', repository: 'haus/other' })).rejects.toThrow(
        'haus/other is not linked on mini.'
    );
    await setComputerPlace(connection.db, board, computerId, { ready: [] });
    await expect(refuse({ place: 'mini' })).rejects.toThrow('No Worker runtime is ready on mini.');
    await setComputerPlace(connection.db, board, computerId, { health: 'offline' });
    await expect(refuse({ place: 'mini' })).rejects.toThrow('mini is offline');
    await setComputerPlace(connection.db, board, computerId, { enabled: false });
    await expect(refuse({ place: 'mini' })).rejects.toThrow(
        'Workers can\'t run on mini: its "Workers can run here" switch is off.'
    );
    await connection.db
        .update(projectsTable)
        .set({ defaultWorkerComputerId: computerId, defaultWorkerPlace: 'computer' })
        .where(eq(projectsTable.chatId, board.seed.channelId));
    await expect(refuse({ place: undefined })).rejects.toThrow(
        `This Task's Project runs Workers on computer:${computerId}, which can't take one now.`
    );
    expect(await countWorkers(board)).toBe(0);
    expect(await readProjectRepositories(connection.db, board)).toEqual(['haus/haus']);
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

test('repos: a named new repo joins the Project, an omitted one is its only repo, and several need --repo', async () => {
    const board = await seedWorkerBoard(connection.db);
    const refuse = (overrides: Parameters<typeof startInput>[1]) =>
        startWorker(connection.db, board.runner, startInput(board, overrides), null);

    await expect(refuse({ repository: undefined })).rejects.toThrow(
        "This Task's Project has no repos yet. Name the repository with --repo <owner/name>."
    );
    await startOn(connection.db, board, { repository: 'Haus/Haus' });
    expect(await readProjectRepositories(connection.db, board)).toEqual(['Haus/Haus']);
    const omitted = await startOn(connection.db, board, { repository: undefined });
    expect(omitted.receipt.worker.repository).toBe('Haus/Haus');
    await startOn(connection.db, board, { repository: 'haus/docs' });
    await expect(refuse({ repository: undefined })).rejects.toThrow(
        "This Task's Project has several repos, so name one with --repo: Haus/Haus, haus/docs."
    );
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

test('a Computer past its own Worker limit queues while another Computer still starts', async () => {
    const board = await computerBoard();
    await setComputerPlace(connection.db, board, board.seed.computerId, { limit: 1 });
    const other = await attachAnotherComputer(connection.db, board, { name: 'studio' });
    await connection.db.execute(sql`
        insert into project_repo_links (server_id, project_repo_id, computer_id, linked_by_user_id)
        select server_id, id, ${other}, ${board.seed.userId} from project_repos
        where project_id = ${board.seed.channelId}
    `);

    const first = await startOn(connection.db, board, { place: 'mini' });
    const second = await startOn(connection.db, board, { place: 'mini' });
    const elsewhere = await startOn(connection.db, board, { place: 'studio' });

    expect([first.receipt.state, second.receipt.state, elsewhere.receipt.state]).toEqual([
        'started',
        'queued',
        'started',
    ]);
});

async function countWorkers(board: WorkerBoard) {
    const rows = await connection.db
        .select({ id: workersTable.id })
        .from(workersTable)
        .where(eq(workersTable.serverId, board.seed.serverId));
    return rows.length;
}
