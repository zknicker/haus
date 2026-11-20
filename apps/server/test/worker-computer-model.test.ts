import { afterAll, beforeAll, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { startOn } from './worker-board.fixture.ts';
import { setComputerPlace } from './worker-computer-place.fixture.ts';
import { computerPlaceBoard } from './worker-computer-turn.fixture.ts';

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

async function workerCount() {
    const [row] = await connection.db.execute<{ count: string }>(
        sql`select count(*)::text as count from workers`
    );
    return row?.count;
}

test('a Worker without --model runs a model its Computer reports, never the machine default', async () => {
    const board = await computerPlaceBoard(connection.db);
    const first = await startOn(connection.db, board, { place: 'mini' });
    expect(first.receipt.worker).toMatchObject({
        model: 'claude-opus-5-5',
        runtime: 'claude-code',
    });

    await setComputerPlace(connection.db, board, board.seed.computerId, {
        limit: 50,
        ready: ['claude-code', 'codex'],
    });
    await connection.db.execute(sql`update agents
        set effective_runtime_id = 'codex', effective_model_id = 'gpt-5.5'
        where id = ${board.seed.agentId}`);
    const own = await startOn(connection.db, board, { place: 'mini', runtime: 'codex' });
    expect(own.receipt.worker).toMatchObject({ model: 'gpt-5.5', runtime: 'codex' });
});

test('a model the Computer cannot run, or a runtime with no models, refuses before writing', async () => {
    const board = await computerPlaceBoard(connection.db);
    const before = await workerCount();

    await expect(
        startOn(connection.db, board, { model: 'gpt-6.2-sol', place: 'mini' })
    ).rejects.toThrow('claude-code on mini cannot run gpt-6.2-sol. It can run: claude-opus-5-5.');
    await setComputerPlace(connection.db, board, board.seed.computerId, { runtimes: [] });
    await expect(startOn(connection.db, board, { place: 'mini' })).rejects.toThrow(
        'claude-code on mini reports no models it can run. Name one with --model, or ask a person to check its sign-in there.'
    );
    expect(await workerCount()).toBe(before);

    const named = await startOn(connection.db, board, { model: 'opus', place: 'mini' });
    expect(named.receipt.worker.model).toBe('opus');
});
