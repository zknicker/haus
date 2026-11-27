import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readPullRequestTaskWakes } from '../src/github/pull-request-task-wakes.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { taskPullRequestsTable } from '../src/postgres/schema.ts';
import { insertCrewTask, insertTaskPlace, seedTaskBoard } from './issue-delivery.fixture.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';

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

test('a pull request a person-started Task attached first still wakes the crew Task’s own agent', async () => {
    const board = await seedTaskBoard(connection.db);
    const { seed } = board;
    const filed = await insertTaskPlace(connection.db, board, 'Filed by a person');
    const crew = await insertCrewTask(connection.db, board, 'Started by the Captain');
    const started = crew.taskId;
    for (const [taskId, createdAt] of [
        [filed, new Date('2026-11-26T10:00:00.000Z')],
        [started, new Date('2026-11-26T11:00:00.000Z')],
    ] as const) {
        await connection.db.insert(taskPullRequestsTable).values({
            createdAt,
            number: 42,
            repository: 'github.com/acme/api',
            serverId: seed.serverId,
            taskId,
        });
    }

    const wakes = await readPullRequestTaskWakes(connection.db, {
        number: 42,
        repository: 'github.com/acme/api',
        serverId: seed.serverId,
    });

    expect(wakes).toEqual([{ agentId: crew.agentId, chatId: crew.chatId }]);
});
