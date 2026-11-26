import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createIssue } from '../src/issues/issue-create.ts';
import { updateIssue } from '../src/issues/issue-update.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    assignNewIssue,
    insertTaskPlace,
    issueInboxRows,
    seedTaskBoard,
} from './issue-delivery.fixture.ts';
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

test('moving an Issue to Backlog, Done or Canceled retires its queued assignment', async () => {
    const board = await seedTaskBoard(connection.db);
    const { seed } = board;
    const person = { kind: 'user', userId: seed.userId } as const;
    for (const state of ['backlog', 'done', 'canceled'] as const) {
        const filed = await assignNewIssue(connection.db, board, `Parked in ${state}`);
        await updateIssue(connection.db, person, {
            expectedVersion: filed.issue.version,
            issueId: filed.issue.id,
            patch: { state },
            serverId: seed.serverId,
        });
    }

    expect(
        (await issueInboxRows(connection.db, seed.agentId)).filter(
            (row) => row.source === 'issue_assignment'
        )
    ).toEqual([]);
});

test('a Captain assigning an Issue to a Task it started does not wake itself', async () => {
    const board = await seedTaskBoard(connection.db);
    const { seed } = board;
    const taskId = await insertTaskPlace(connection.db, board, 'Crew', { agentId: seed.agentId });
    const filed = await createIssue(
        connection.db,
        { agentId: seed.agentId, kind: 'captain' },
        {
            assignee: { kind: 'task', taskId },
            projectId: seed.channelId,
            serverId: seed.serverId,
            title: 'Self-staffed',
        }
    );

    expect(filed.agentWakes).toEqual([]);
    expect(await issueInboxRows(connection.db, seed.agentId)).toEqual([]);
});
