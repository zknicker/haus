import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentCommandSchema, agentTurnTriggerSchema } from '@haus/api';
import { eq } from 'drizzle-orm';
import { enqueueAgentGreeting } from '../src/agent-delivery/greeting.ts';
import { addIssueComment } from '../src/issues/issue-comments.ts';
import { updateIssue } from '../src/issues/issue-update.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentRunTriggersTable } from '../src/postgres/schema.ts';
import { resolveAgentTurnTriggers } from '../src/server-agents/agent-turn-trigger-previews.ts';
import { addChannel, deliverHuman, offlineDelivery } from './agent-inbox-harness.ts';
import {
    addPeerAgent,
    assignNewIssue,
    issueInboxRows,
    seedTaskBoard,
    type TaskBoard,
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

const seedBoard = () => seedTaskBoard(connection.db);
const assign = (board: TaskBoard, title: string, priority: 'high' | 'urgent' = 'high') =>
    assignNewIssue(connection.db, board, title, { priority });

test('ten assignments to an idle Captain wake it once, by priority then age', async () => {
    const board = await seedBoard();
    const { seed } = board;
    const { delivery, runner, wake } = offlineDelivery(connection.db, seed);
    const results: Awaited<ReturnType<typeof assign>>[] = [];
    for (let index = 1; index <= 9; index += 1) {
        results.push(await assign(board, `Issue ${index}`));
    }
    const urgent = await assign(board, 'Urgent', 'urgent');
    expect(results[0]?.agentWakes).toEqual([{ agentId: seed.agentId, serverId: seed.serverId }]);
    expect(await issueInboxRows(connection.db, seed.agentId)).toHaveLength(10);

    const start = await wake();
    expect(runner.starts()).toHaveLength(1);
    expect(start).toMatchObject({ chatId: null, inbox: [], inboxDelivery: 'concrete' });
    expect(start?.issueAssignments?.map((issue) => issue.title)).toEqual([
        'Urgent',
        ...results.map((result) => result.issue.title),
    ]);
    expect(start?.issueAssignments?.[1]).toEqual({
        by: `@${seed.humanHandle}`,
        byAgent: false,
        code: 'GEN-1',
        id: `issue-assign:${results[0]?.issue.id}:1`,
        issueId: results[0]?.issue.id ?? '',
        priority: 'high',
        state: 'todo',
        title: 'Issue 1',
    });
    expect(agentCommandSchema.safeParse(start).success).toBe(true);

    await delivery.dispatchAgent(seed.agentId, seed.serverId, { resendActive: true });
    expect(runner.starts().at(-1)).toEqual(start as never);

    const runId = start?.runId ?? '';
    const [trigger] = await connection.db
        .select()
        .from(agentRunTriggersTable)
        .where(eq(agentRunTriggersTable.runId, runId));
    expect(trigger).toMatchObject({ chatId: null, source: 'issue_assignment' });
    const [named] = await resolveAgentTurnTriggers(connection.db, seed.serverId, [
        {
            chatId: null,
            runId,
            source: 'issue_assignment',
            visible: false,
            workId: trigger?.workId ?? '',
        },
    ]);
    expect(agentTurnTriggerSchema.parse(named)).toEqual({
        code: 'GEN-1',
        issueId: results[0]?.issue.id ?? '',
        kind: 'issue',
        more: 9,
        title: 'Issue 1',
    });
    expect(urgent.issue.code).toBe('GEN-10');

    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, runId));
    const rows = await issueInboxRows(connection.db, seed.agentId);
    expect(rows.every((row) => row.state === 'seen')).toBe(true);
});

test('one run carries at most fifty assignments; the rest wait for the next', async () => {
    const board = await seedBoard();
    const { seed } = board;
    const { delivery, runner, wake } = offlineDelivery(connection.db, seed);
    for (let index = 1; index <= 51; index += 1) {
        await assign(board, `Issue ${index}`);
    }

    const first = await wake();
    expect(first?.issueAssignments).toHaveLength(50);
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, first?.runId ?? ''));
    expect(runner.starts().at(-1)?.issueAssignments?.map((issue) => issue.title)).toEqual([
        'Issue 51',
    ]);
});

test('a busy Captain gets a content-free count, then the Issues on its next turn', async () => {
    const board = await seedBoard();
    const { seed } = board;
    const { delivery, runner, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    runner.attach(seed.agentId);
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    const runId = runner.starts()[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });

    const first = await assign(board, 'Rotate the keys');
    const second = await assign(board, 'Patch the host');
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.channelId });

    const notice = runner.framesOfType('notice').at(-1);
    expect(notice).toMatchObject({
        issueItems: {
            ids: [`issue-assign:${first.issue.id}:1`, `issue-assign:${second.issue.id}:1`],
            total: 2,
        },
        runId,
    });
    expect(notice?.inbox).toHaveLength(2);
    expect(JSON.stringify(notice)).not.toContain('Rotate the keys');
    expect(agentCommandSchema.safeParse(notice).success).toBe(true);

    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, runId));
    const next = runner.starts().at(-1);
    expect(next?.runId).not.toBe(runId);
    expect(next?.issueAssignments?.map((issue) => issue.title)).toEqual([
        'Rotate the keys',
        'Patch the host',
    ]);
});

test('reassigning or unassigning before a run takes it retires the queued assignment', async () => {
    const board = await seedBoard();
    const { seed } = board;
    const peerId = await addPeerAgent(connection.db, seed);
    const person = { kind: 'user', userId: seed.userId } as const;
    const moved = await assign(board, 'Moves to the peer');
    const dropped = await assign(board, 'Loses its assignee');

    await updateIssue(connection.db, person, {
        expectedVersion: moved.issue.version,
        issueId: moved.issue.id,
        patch: { assignee: { agentId: peerId, kind: 'captain' } },
        serverId: seed.serverId,
    });
    await updateIssue(connection.db, person, {
        expectedVersion: dropped.issue.version,
        issueId: dropped.issue.id,
        patch: { assignee: null },
        serverId: seed.serverId,
    });

    expect(await issueInboxRows(connection.db, seed.agentId)).toEqual([]);
    expect((await issueInboxRows(connection.db, peerId)).map((row) => row.dedupeKey)).toEqual([
        `issue-assign:${moved.issue.id}:2`,
    ]);
});

test('Backlog queues nothing until the Issue leaves it', async () => {
    const board = await seedBoard();
    const { seed } = board;
    const person = { kind: 'user', userId: seed.userId } as const;
    const parked = await assignNewIssue(connection.db, board, 'Someday');
    const backlog = await updateIssue(connection.db, person, {
        expectedVersion: parked.issue.version,
        issueId: parked.issue.id,
        patch: { assignee: null, state: 'backlog' },
        serverId: seed.serverId,
    });
    const reassigned = await updateIssue(connection.db, person, {
        expectedVersion: backlog.issue.version,
        issueId: parked.issue.id,
        patch: { assignee: { agentId: seed.agentId, kind: 'captain' } },
        serverId: seed.serverId,
    });
    expect(reassigned.agentWakes).toEqual([]);
    expect(await issueInboxRows(connection.db, seed.agentId)).toEqual([]);

    await updateIssue(connection.db, person, {
        expectedVersion: reassigned.issue.version,
        issueId: parked.issue.id,
        patch: { state: 'todo' },
        serverId: seed.serverId,
    });
    expect((await issueInboxRows(connection.db, seed.agentId)).map((row) => row.source)).toEqual([
        'issue_assignment',
    ]);
});

test('comments and state changes coalesce into one Issue event run', async () => {
    const board = await seedBoard();
    const { seed } = board;
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const person = { kind: 'user', userId: seed.userId } as const;
    const filed = await assign(board, 'Rotate the keys');
    const assigned = await wake();
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, assigned?.runId ?? ''));

    const comment = await addIssueComment(connection.db, person, {
        body: 'Is the old key revoked?',
        issueId: filed.issue.id,
        serverId: seed.serverId,
    });
    await updateIssue(connection.db, person, {
        expectedVersion: filed.issue.version,
        issueId: filed.issue.id,
        patch: { state: 'done' },
        serverId: seed.serverId,
    });

    const start = await wake();
    expect(start?.issueEvents?.map((event) => event.change)).toEqual([
        {
            body: 'Is the old key revoked?',
            commentId: comment.comment.id,
            kind: 'commented',
            truncated: false,
        },
        { from: 'todo', kind: 'state_changed', to: 'done' },
    ]);
    expect(agentCommandSchema.safeParse(start).success).toBe(true);
});

test('Issue items never run the main session ahead of the greeting', async () => {
    const board = await seedBoard();
    const { seed } = board;
    const { delivery, runner, wake } = offlineDelivery(connection.db, seed);
    const allChannelId = await addChannel(connection.db, seed, 'all');
    await enqueueAgentGreeting(connection.db, {
        agentId: seed.agentId,
        allChannelId,
        serverId: seed.serverId,
    });
    await assign(board, 'Say hello');

    const first = await wake();
    expect(first).toMatchObject({ chatId: allChannelId, greets: true });
    expect(first).not.toHaveProperty('issueAssignments');
    await delivery.onAck({ agentId: seed.agentId, runId: first?.runId ?? '' });
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, first?.runId ?? ''));

    const assignment = runner.starts().at(-1);
    expect(assignment?.issueAssignments).toHaveLength(1);
    expect(assignment?.greets).toBeUndefined();
});
