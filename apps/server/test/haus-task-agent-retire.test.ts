import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentInboxTable,
    boardColumnsTable,
    chatMessagesTable,
    messageClaimsTable,
} from '../src/postgres/schema.ts';
import { assignTask } from '../src/tasks/task-assign.ts';
import { createTask } from '../src/tasks/task-create.ts';
import { moveTask } from '../src/tasks/task-move.ts';
import { settledTurn } from './agent-dream-fixture.ts';
import { offlineDelivery, type Seed } from './agent-inbox-harness.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';
import {
    addPeerAgent,
    assignNewTask,
    seedTaskBoard,
    type TaskBoard,
    taskInboxRows,
} from './task-delivery-fixture.ts';

/** When a `task_assignment` item leaves the queue undelivered (ADR 0051 decision 5). */
let cluster: PostgresCluster;
let connection: HausConnection;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

const seedBoard = () => seedTaskBoard(connection.db);
const inboxRows = (seed: Seed) => taskInboxRows(connection.db, seed);
const assignNew = (delivery: AgentDelivery, board: TaskBoard, title: string) =>
    assignNewTask(connection.db, delivery, board, title);

test('reassigning or unassigning before delivery retires the queued item', async () => {
    const board = await seedBoard();
    const { seed } = board;
    const { delivery, wake, transport } = offlineDelivery(connection.db, seed);
    const actor = { kind: 'user', userId: seed.userId } as const;
    const peerId = await addPeerAgent(connection.db, seed);

    const handedOff = await assignNew(delivery, board, 'Handed off');
    const dropped = await assignNew(delivery, board, 'Dropped');
    const kept = await assignNew(delivery, board, 'Kept');
    await assignTask(connection.db, actor, delivery, {
        assignee: { agentId: peerId, kind: 'agent' },
        expectedVersion: 1,
        serverId: seed.serverId,
        taskId: handedOff.task.id,
    });
    await assignTask(connection.db, actor, delivery, {
        assignee: null,
        expectedVersion: 1,
        serverId: seed.serverId,
        taskId: dropped.task.id,
    });
    expect((await inboxRows(seed)).map((row) => row.dedupeKey)).toEqual([
        `task-assign:${kept.task.id}:1`,
    ]);

    const start = await wake();
    expect(start?.taskAssignments?.map((task) => task.title)).toEqual(['Kept']);
    expect(transport.framesOfType('start')).toHaveLength(1);
});

test('a failed run forgets an assignment the Agent has a newer one for, so the Task comes once', async () => {
    const board = await seedBoard();
    const { seed } = board;
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    const actor = { kind: 'user', userId: seed.userId } as const;
    const peerId = await addPeerAgent(connection.db, seed);
    const { task } = await assignNew(delivery, board, 'There and back');
    transport.online.add(seed.computerId);
    await delivery.dispatchAgent(seed.agentId, seed.serverId);
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    const scope = { serverId: seed.serverId, taskId: task.id };

    await assignTask(connection.db, actor, delivery, {
        ...scope,
        assignee: { agentId: peerId, kind: 'agent' },
        expectedVersion: 1,
    });
    await assignTask(connection.db, actor, delivery, {
        ...scope,
        assignee: { agentId: seed.agentId, kind: 'agent' },
        expectedVersion: 2,
    });
    expect((await inboxRows(seed)).map((row) => row.dedupeKey).sort()).toEqual([
        `task-assign:${task.id}:1`,
        `task-assign:${task.id}:3`,
    ]);

    await delivery.onTurnSettled(seed.computerId, {
        ...settledTurn(seed, runId),
        status: 'failed',
    });
    expect((await inboxRows(seed)).map((row) => row.dedupeKey)).toEqual([
        `task-assign:${task.id}:3`,
    ]);
});

test('a failed run keeps its assignment when the Task only moved meanwhile', async () => {
    const board = await seedBoard();
    const { boardId, seed } = board;
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    const { task } = await assignNew(delivery, board, 'Moved, still mine');
    transport.online.add(seed.computerId);
    await delivery.dispatchAgent(seed.agentId, seed.serverId);
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    const [column] = await connection.db
        .select({ id: boardColumnsTable.id })
        .from(boardColumnsTable)
        .where(
            and(eq(boardColumnsTable.boardId, boardId), eq(boardColumnsTable.category, 'active'))
        );

    await moveTask(
        connection.db,
        { kind: 'user', userId: seed.userId },
        {
            columnId: column?.id ?? '',
            expectedVersion: 1,
            serverId: seed.serverId,
            taskId: task.id,
        }
    );
    await delivery.onTurnSettled(seed.computerId, {
        ...settledTurn(seed, runId),
        status: 'failed',
    });
    expect(await inboxRows(seed)).toEqual([
        { dedupeKey: `task-assign:${task.id}:1`, mentioned: true, state: 'queued' },
    ]);
});

test('a failed run forgets a claim assignment whose claim is gone, and keeps a live one', async () => {
    const claimAssignments = async (seed: Seed) =>
        await connection.db
            .select({ dedupeKey: agentInboxTable.dedupeKey, state: agentInboxTable.state })
            .from(agentInboxTable)
            .where(eq(agentInboxTable.agentId, seed.agentId));
    const failRun = async (seed: Seed, dedupeKey: string) => {
        const { delivery, transport } = offlineDelivery(connection.db, seed);
        transport.online.add(seed.computerId);
        await delivery.deliver({
            agentId: seed.agentId,
            chatId: seed.channelId,
            content: '[Haus claim assignment claim=#1 target=#product] Work',
            dedupeKey,
            mentioned: true,
            serverId: seed.serverId,
            source: 'claim_assignment',
        });
        await delivery.onTurnSettled(seed.computerId, {
            ...settledTurn(seed, transport.framesOfType('start')[0]?.runId ?? ''),
            status: 'failed',
        });
    };

    const { seed: migrated } = await seedBoard();
    await failRun(migrated, 'claim-assign:msg_migrated_away:1');
    expect(await claimAssignments(migrated)).toEqual([]);

    const { seed: live } = await seedBoard();
    const messageId = createOpaqueId('msg');
    await connection.db.insert(chatMessagesTable).values({
        authorUserId: live.userId,
        chatId: live.channelId,
        content: 'Work',
        id: messageId,
        nonce: createOpaqueId('nonce'),
        sequence: 1,
        serverId: live.serverId,
    });
    await connection.db.insert(messageClaimsTable).values({
        assigneeAgentId: live.agentId,
        chatId: live.channelId,
        createdByUserId: live.userId,
        messageId,
        number: 1,
        origin: 'claimed',
        serverId: live.serverId,
        status: 'todo',
    });
    await failRun(live, `claim-assign:${messageId}:1`);
    expect(await claimAssignments(live)).toEqual([
        { dedupeKey: `claim-assign:${messageId}:1`, state: 'queued' },
    ]);
});

test('self-assignment enqueues nothing, and a failed run forgets a Task reassigned meanwhile', async () => {
    const board = await seedBoard();
    const { boardId, seed } = board;
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    const actor = { kind: 'user', userId: seed.userId } as const;

    const own = await createTask(
        connection.db,
        { agentId: seed.agentId, kind: 'agent' },
        delivery,
        {
            assignee: { agentId: seed.agentId, kind: 'agent' },
            boardId,
            serverId: seed.serverId,
            title: 'My own',
        }
    );
    expect(own.wakes).toEqual([]);
    expect(await inboxRows(seed)).toEqual([]);

    const task = await assignNew(delivery, board, 'Reassigned mid-run');
    transport.online.add(seed.computerId);
    await delivery.dispatchAgent(seed.agentId, seed.serverId);
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await assignTask(connection.db, actor, delivery, {
        assignee: null,
        expectedVersion: 1,
        serverId: seed.serverId,
        taskId: task.task.id,
    });
    // The run already holds it, so reassigning leaves the row with that run.
    expect((await inboxRows(seed)).map((row) => row.state)).toEqual(['accepted']);

    await delivery.onTurnSettled(seed.computerId, {
        ...settledTurn(seed, runId),
        status: 'failed',
    });
    expect(await inboxRows(seed)).toEqual([]);
});
