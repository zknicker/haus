import { afterAll, beforeAll, expect, test } from 'bun:test';
import { enqueueInboxItem } from '../src/agent-delivery/store.ts';
import { updateIssue } from '../src/issues/issue-update.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import {
    addPeerAgent,
    assignNewIssue,
    issueInboxRows,
    seedTaskBoard,
} from './issue-delivery-fixture.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { settledTurn } from './settled-turn-fixture.ts';

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

test('one malformed Issue assignment is set aside and the rest still drain together', async () => {
    const board = await seedTaskBoard(connection.db);
    const { seed } = board;
    const { runner, wake } = offlineDelivery(connection.db, seed);
    await assignNewIssue(connection.db, board, 'Rotate the keys');
    await assignNewIssue(connection.db, board, 'Patch the host');
    await enqueueInboxItem(connection.db, {
        agentId: seed.agentId,
        chatId: null,
        content: '{"not":"an assignment"}',
        dedupeKey: 'issue-assign:iss_broken:1',
        serverId: seed.serverId,
        source: 'issue_assignment',
    });

    const start = await wake();

    expect(runner.starts()).toHaveLength(1);
    expect(start?.issueAssignments?.map((issue) => issue.title)).toEqual([
        'Rotate the keys',
        'Patch the host',
    ]);
    const rows = await issueInboxRows(connection.db, seed.agentId);
    expect(rows.map((row) => [row.dedupeKey.startsWith('issue-assign:iss_broken'), row.state])).toEqual([
        [false, 'accepted'],
        [false, 'accepted'],
        [true, 'seen'],
    ]);
});

test('a failed run forgets an assignment whose Issue went elsewhere, and keeps a current one', async () => {
    const board = await seedTaskBoard(connection.db);
    const { seed } = board;
    const peerId = await addPeerAgent(connection.db, seed);
    const { delivery, runner, wake } = offlineDelivery(connection.db, seed);
    const moved = await assignNewIssue(connection.db, board, 'Moves to the peer');
    const kept = await assignNewIssue(connection.db, board, 'Stays here');
    await wake();
    await updateIssue(
        connection.db,
        { kind: 'user', userId: seed.userId },
        {
            expectedVersion: moved.issue.version,
            issueId: moved.issue.id,
            patch: { assignee: { agentId: peerId, kind: 'captain' } },
            serverId: seed.serverId,
        }
    );

    await delivery.onTurnSettled(seed.computerId, {
        ...settledTurn(seed, runner.starts()[0]?.runId ?? ''),
        status: 'failed',
    });

    const rows = await issueInboxRows(connection.db, seed.agentId);
    expect(rows.map((row) => row.dedupeKey)).toEqual([`issue-assign:${kept.issue.id}:1`]);
});
