import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { chatMessagesTable, workersTable } from '../src/postgres/schema.ts';
import { setProjectDefaultWorkerPlace } from '../src/projects/project-worker-defaults.ts';
import { setTaskState } from '../src/tasks/task-set-state.ts';
import { startWorker } from '../src/workers/start-worker.ts';
import {
    workerInstructionsMaxLength,
    workerInstructions,
} from '../src/workers/worker-instructions.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import {
    readTaskState,
    readTurns,
    seedWorkerBoard,
    setReadyPlaces,
    startInput,
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

test('a start records the Worker and its brief, posts no Message, and dispatches the turn', async () => {
    const board = await seedWorkerBoard(connection.db);
    const messagesBefore = await countMessages(board.task.chatId);

    const started = await startOn(connection.db, board, { brief: 'Make it deterministic.' });

    const { worker } = started.receipt;
    expect(started.receipt.state).toBe('started');
    expect(worker).toMatchObject({
        carrierComputerId: board.seed.computerId,
        closedAt: null,
        launchMessageId: null,
        originChatId: null,
        place: { kind: 'cursor' },
        status: 'queued',
        taskId: board.task.id,
    });
    expect(worker.id).toMatch(/^wkr_/u);
    expect(worker.turns).toHaveLength(1);
    expect(worker.turns[0]?.turnId).toMatch(/^wkt_/u);
    expect(worker.turns[0]?.input).toEqual([
        {
            at: worker.turns[0]?.input?.[0]?.at ?? '',
            author: { id: board.seed.agentId, kind: 'agent' },
            kind: 'brief',
            messageId: null,
            text: 'Make it deterministic.',
        },
    ]);
    expect(await countMessages(board.task.chatId)).toBe(messagesBefore);
    const [frame] = started.effects.frames;
    expect(frame?.computerId).toBe(board.seed.computerId);
    expect(frame?.frame).toMatchObject({
        place: { kind: 'cursor' },
        predecessorTurnIds: [],
        providerAgentId: null,
        repository: 'haus/haus',
        startingRef: 'main',
        title: 'Fix the flaky delivery test',
        turnId: worker.turns[0]?.turnId,
        type: 'worker-turn-start',
        workerId: worker.id,
    });
    const handle = await agentHandle(board.seed.agentId);
    expect(frame?.frame.type === 'worker-turn-start' && frame.frame.input).toBe(
        `${workerInstructions({ agentHandle: handle ?? '', place: 'cloud', taskKey: board.task.key })}\n\n## Brief from @${handle}\n\nMake it deterministic.`
    );
    expect(started.effects.events.map((event) => event.delivery.event)).toEqual([
        {
            chatId: board.task.chatId,
            serverId: board.seed.serverId,
            taskId: board.task.id,
            workerId: worker.id,
        },
    ]);
});

test('the Haus Worker instructions name the Task trailer and the final lines, within their cap', () => {
    const text = workerInstructions({ agentHandle: 'forge', place: 'cloud', taskKey: 'ENG-41' });
    expect(text.length).toBeLessThanOrEqual(workerInstructionsMaxLength);
    expect(text).toContain('`Haus-Task: ENG-41`');
    expect(text).toContain('Haus-Outcome: done, needs-you, or failed');
    expect(text).toContain('Haus-Person: @handle');
    expect(text).toContain('pull request, put its URL in your final message');
    expect(text).toContain('AGENTS.md');
});

test('a retried start returns the same Worker, and a reused nonce for other work is refused', async () => {
    const board = await seedWorkerBoard(connection.db);
    const input = startInput(board, { nonce: 'retry-me' });
    const first = await startWorker(connection.db, board.runner, input);
    const again = await startWorker(connection.db, board.runner, input);

    expect(first.kind === 'started' && again.kind === 'started').toBe(true);
    expect(again.kind === 'started' && again.receipt.worker.id).toBe(
        first.kind === 'started' && first.receipt.worker.id
    );
    expect(again.kind === 'started' && again.effects.frames).toEqual([]);
    await expect(
        startWorker(connection.db, board.runner, { ...input, title: 'Something else' })
    ).rejects.toThrow('That start nonce already started a different Worker');
    expect(await countWorkers(board.seed.serverId)).toBe(1);
});

test('a start without a usable Task or place is refused before anything is written', async () => {
    const board = await seedWorkerBoard(connection.db, ['claude']);
    const delivery = offlineDelivery(connection.db, board.seed).delivery;
    const refuse = (overrides: Parameters<typeof startInput>[1]) =>
        startWorker(connection.db, board.runner, startInput(board, overrides));

    await expect(refuse({ task: undefined })).rejects.toThrow('A Worker needs a Task.');
    await expect(refuse({ task: 'ZZZ-404' })).rejects.toThrow('Task ZZZ-404 does not exist');
    await expect(refuse({ place: undefined })).rejects.toThrow(
        "This Task's Project has no default place for Workers, so say where the Worker runs with --on. Ready places: claude."
    );
    await expect(refuse({ place: 'cursor' })).rejects.toThrow(
        'No online Computer has cursor ready.'
    );
    await setReadyPlaces(
        connection.db,
        board.seed.serverId,
        board.seed.computerId,
        ['claude'],
        'offline'
    );
    await expect(refuse({ place: 'claude' })).rejects.toThrow(
        'No online Computer has claude ready.'
    );
    await setReadyPlaces(connection.db, board.seed.serverId, board.seed.computerId, ['claude']);
    const { version = 1 } = (await readTaskState(connection.db, board.task.id)) ?? {};
    await setTaskState(connection.db, { kind: 'user', userId: board.seed.userId }, delivery, {
        expectedVersion: version,
        serverId: board.seed.serverId,
        state: 'done',
        taskId: board.task.id,
    });
    await expect(refuse({ place: 'claude' })).rejects.toThrow(`Task ${board.task.key} is closed.`);
    expect(await countWorkers(board.seed.serverId)).toBe(0);
});

test("a start without --on runs on the Project's default, never on the Computer's cloud default", async () => {
    const board = await seedWorkerBoard(connection.db);
    const { seed } = board;
    await setReadyPlaces(
        connection.db,
        seed.serverId,
        seed.computerId,
        ['cursor', 'claude'],
        'healthy',
        'cursor'
    );

    await expect(
        startWorker(connection.db, board.runner, startInput(board, { place: undefined }))
    ).rejects.toThrow(
        "This Task's Project has no default place for Workers, so say where the Worker runs with --on. Ready places: cursor, claude."
    );
    expect(await countWorkers(seed.serverId)).toBe(0);

    await setProjectDefaultWorkerPlace(
        connection.db,
        { id: seed.userId },
        {
            place: { kind: 'claude' },
            projectId: seed.channelId,
            serverId: seed.serverId,
        }
    );
    const { worker } = (await startOn(connection.db, board, { place: undefined })).receipt;

    expect([worker.place, worker.carrierComputerId]).toEqual([{ kind: 'claude' }, seed.computerId]);
});

test('a start past its place limit queues, and starts when a slot frees', async () => {
    const board = await seedWorkerBoard(connection.db);
    await connection.db.execute(sql`
        insert into worker_place_limits (server_id, place, worker_limit)
        values (${board.seed.serverId}, 'cursor', 1)
    `);
    const first = await startOn(connection.db, board);
    const second = await startOn(connection.db, board);
    const elsewhere = await startOn(connection.db, board, { place: 'claude' });

    expect([first.receipt.state, second.receipt.state, elsewhere.receipt.state]).toEqual([
        'started',
        'queued',
        'started',
    ]);
    expect(second.effects.frames).toEqual([]);
    const [secondTurn] = await readTurns(connection.db, second.receipt.worker.id);
    expect(secondTurn?.dispatchedAt).toBeNull();
});

async function countMessages(chatId: string) {
    const rows = await connection.db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.chatId, chatId));
    return rows.length;
}

async function countWorkers(serverId: string) {
    const rows = await connection.db
        .select({ id: workersTable.id })
        .from(workersTable)
        .where(eq(workersTable.serverId, serverId));
    return rows.length;
}

async function agentHandle(agentId: string) {
    const [row] = (await connection.db.execute(
        sql`select handle from agents where id = ${agentId}`
    )) as unknown as { handle: string }[];
    return row?.handle;
}
