import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, desc, eq } from 'drizzle-orm';
import { createIssue } from '../src/issues/issue-create.ts';
import { IssueAssigneeArchivedError } from '../src/issues/issue-errors.ts';
import { readIssue } from '../src/issues/issue-read.ts';
import { updateIssue } from '../src/issues/issue-update.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { issueEventsTable } from '../src/postgres/schema.ts';
import { archiveTask } from '../src/tasks/task-archive.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import {
    insertTaskPlace,
    issueInboxRows,
    seedTaskBoard,
    type TaskBoard,
} from './issue-delivery-fixture.ts';
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

function fileOnTask(board: TaskBoard, taskId: string, title: string, state?: 'done') {
    const { seed } = board;
    return createIssue(
        connection.db,
        { kind: 'user', userId: seed.userId },
        {
            assignee: { kind: 'task', taskId },
            projectId: seed.channelId,
            serverId: seed.serverId,
            title,
            ...(state ? { state } : {}),
        }
    );
}

async function archive(board: TaskBoard, taskId: string, actor = board.seed.userId) {
    const { seed } = board;
    return await archiveTask(
        connection.db,
        { kind: 'user', userId: actor },
        offlineDelivery(connection.db, seed).delivery,
        { expectedVersion: 1, serverId: seed.serverId, taskId }
    );
}

async function lastAssigneeEvent(issueId: string) {
    const [row] = await connection.db
        .select({
            actor_agent_id: issueEventsTable.actorAgentId,
            actor_task_id: issueEventsTable.actorTaskId,
            actor_user_id: issueEventsTable.actorUserId,
            change: issueEventsTable.change,
        })
        .from(issueEventsTable)
        .where(
            and(
                eq(issueEventsTable.issueId, issueId),
                eq(issueEventsTable.kind, 'assignee_changed')
            )
        )
        .orderBy(desc(issueEventsTable.createdAt), desc(issueEventsTable.id))
        .limit(1);
    return row;
}

test("archiving a Task hands its open Issues to its Captain, with the Server's activity row", async () => {
    const board = await seedTaskBoard(connection.db);
    const { seed } = board;
    const taskId = await insertTaskPlace(connection.db, board, 'Crew work', {
        agentId: seed.agentId,
    });
    const open = await fileOnTask(board, taskId, 'Still open');
    const closed = await fileOnTask(board, taskId, 'Already done', 'done');

    const archived = await archive(board, taskId);

    const captain = { agentId: seed.agentId, kind: 'captain' } as const;
    expect((await readIssue(connection.db, seed.serverId, open.issue.id)).assignee).toEqual(
        captain
    );
    expect((await readIssue(connection.db, seed.serverId, closed.issue.id)).assignee).toEqual({
        kind: 'task',
        taskId,
    });
    expect(await lastAssigneeEvent(open.issue.id)).toEqual({
        actor_agent_id: null,
        actor_task_id: null,
        actor_user_id: null,
        change: { from: { kind: 'task', taskId }, kind: 'assignee_changed', to: captain },
    });
    expect(archived.wakes).toContainEqual({ agentId: seed.agentId, serverId: seed.serverId });
    expect(
        (await issueInboxRows(connection.db, seed.agentId)).map((row) => row.dedupeKey)
    ).toEqual([`issue-assign:${open.issue.id}:2`]);
});

test('a Task a person started hands its open Issues back to that person', async () => {
    const board = await seedTaskBoard(connection.db);
    const { seed } = board;
    const taskId = await insertTaskPlace(connection.db, board, 'Filed by hand');
    const open = await fileOnTask(board, taskId, 'Back to the person');

    await archive(board, taskId);

    expect((await readIssue(connection.db, seed.serverId, open.issue.id)).assignee).toEqual({
        kind: 'user',
        userId: seed.userId,
    });
});

test('an open Issue refuses an archived Task with ISSUE_ASSIGNEE_ARCHIVED', async () => {
    const board = await seedTaskBoard(connection.db);
    const { seed } = board;
    const taskId = await insertTaskPlace(connection.db, board, 'Done and archived');
    const closed = await fileOnTask(board, taskId, 'Closed on it', 'done');
    await archive(board, taskId);
    const person = { kind: 'user', userId: seed.userId } as const;

    await expect(fileOnTask(board, taskId, 'New work')).rejects.toBeInstanceOf(
        IssueAssigneeArchivedError
    );
    await expect(
        updateIssue(connection.db, person, {
            expectedVersion: closed.issue.version,
            issueId: closed.issue.id,
            patch: { state: 'todo' },
            serverId: seed.serverId,
        })
    ).rejects.toBeInstanceOf(IssueAssigneeArchivedError);
    expect(await fileOnTask(board, taskId, 'Closed history', 'done')).toMatchObject({
        issue: { assignee: { kind: 'task', taskId } },
    });
});
