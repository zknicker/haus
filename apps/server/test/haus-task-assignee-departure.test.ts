import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentInboxTable,
    agentsTable,
    boardColumnsTable,
    serverMembershipsTable,
    serversTable,
    taskInboxItemsTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { deleteAgent } from '../src/server-agents/delete-agent.ts';
import { removeServerMember } from '../src/servers/remove-member.ts';
import { assignTask } from '../src/tasks/task-assign.ts';
import { createTask } from '../src/tasks/task-create.ts';
import { getTask } from '../src/tasks/task-list.ts';
import { moveTask } from '../src/tasks/task-move.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';
import { addPeerAgent, seedTaskBoard } from './task-delivery-fixture.ts';

/** A Task's assignee stays an active member or a live Agent, so a departure unassigns (ADR 0051). */
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

async function seedDepartures() {
    const board = await seedTaskBoard(connection.db);
    const { boardId, seed } = board;
    const { delivery } = offlineDelivery(connection.db, seed);
    const owner = { kind: 'user', userId: seed.userId } as const;
    const create = (title: string, assignee: Parameters<typeof createTask>[3]['assignee']) =>
        createTask(connection.db, owner, delivery, {
            assignee,
            boardId,
            serverId: seed.serverId,
            title,
        });
    const read = (taskId: string) =>
        getTask(connection.db, owner, { serverId: seed.serverId, taskId });
    return { ...board, create, delivery, owner, read };
}

async function addMember(serverId: string) {
    const userId = createOpaqueId('usr');
    await connection.db
        .insert(usersTable)
        .values({ authSubject: createOpaqueId('clk'), id: userId });
    await connection.db.insert(serverMembershipsTable).values({
        handle: `bo-${userId.slice(-6).toLowerCase()}`,
        id: createOpaqueId('mem'),
        role: 'member',
        serverId,
        userId,
    });
    return userId;
}

/** Removal and leaving both confirm with the Server's address. */
async function slugOf(serverId: string) {
    const [server] = await connection.db
        .select({ slug: serversTable.slug })
        .from(serversTable)
        .where(eq(serversTable.id, serverId));
    return server?.slug ?? '';
}

test('deleting an Agent unassigns its Tasks, bumps each, and retires what is still queued', async () => {
    const { boardId, create, delivery, owner, read, seed } = await seedDepartures();
    const assignee = { agentId: seed.agentId, kind: 'agent' } as const;
    const peerId = await addPeerAgent(connection.db, seed);

    const queued = await create('Queued', assignee);
    const finished = await create('Finished', assignee);
    const elsewhere = await create('Someone else has it', { agentId: peerId, kind: 'agent' });
    const [doneColumn] = await connection.db
        .select({ id: boardColumnsTable.id })
        .from(boardColumnsTable)
        .where(and(eq(boardColumnsTable.boardId, boardId), eq(boardColumnsTable.category, 'done')));
    await moveTask(connection.db, owner, {
        columnId: doneColumn?.id ?? '',
        expectedVersion: 1,
        serverId: seed.serverId,
        taskId: finished.task.id,
    });

    const { taskEvents } = await deleteAgent(
        connection.db,
        delivery,
        { id: seed.userId },
        { agentId: seed.agentId, confirmation: 'Ada', serverId: seed.serverId }
    );

    expect(await read(queued.task.id)).toMatchObject({ assignee: null, version: 2 });
    expect(await read(finished.task.id)).toMatchObject({
        assignee: null,
        category: 'done',
        version: 3,
    });
    expect(await read(elsewhere.task.id)).toMatchObject({
        assignee: { agentId: peerId, kind: 'agent' },
        version: 1,
    });
    expect(taskEvents.filter((event) => event.topic === 'task.updated')).toHaveLength(2);
    expect(
        await connection.db
            .select({ id: agentInboxTable.id })
            .from(agentInboxTable)
            .where(eq(agentInboxTable.agentId, seed.agentId))
    ).toEqual([]);
    const [agent] = await connection.db
        .select({ retiredAt: agentsTable.retiredAt })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));
    expect(agent?.retiredAt).not.toBeNull();
});

test('removing a member unassigns their Tasks and withdraws their Inbox items', async () => {
    const { create, delivery, read, seed } = await seedDepartures();
    const memberId = await addMember(seed.serverId);
    const assigned = await create('Theirs', { kind: 'user', userId: memberId });
    const kept = await create('Still the Owner’s', { kind: 'user', userId: seed.userId });

    const departure = await removeServerMember(
        connection.db,
        delivery,
        { id: seed.userId },
        { confirmation: await slugOf(seed.serverId), serverId: seed.serverId, userId: memberId }
    );

    expect(await read(assigned.task.id)).toMatchObject({ assignee: null, version: 2 });
    expect(await read(kept.task.id)).toMatchObject({
        assignee: { kind: 'user', userId: seed.userId },
        version: 1,
    });
    expect(
        await connection.db
            .select({ taskId: taskInboxItemsTable.taskId })
            .from(taskInboxItemsTable)
            .where(eq(taskInboxItemsTable.userId, memberId))
    ).toEqual([]);
    expect(departure.taskEvents.map((event) => event.topic).sort()).toEqual([
        'task.updated',
        'taskInbox.changed',
    ]);
});

test('leaving unassigns what the person held, and their assignments to others stay', async () => {
    const { boardId, delivery, read, seed } = await seedDepartures();
    const memberId = await addMember(seed.serverId);
    const leaver = { kind: 'user', userId: memberId } as const;
    const self = await createTask(connection.db, leaver, delivery, {
        assignee: leaver,
        boardId,
        serverId: seed.serverId,
        title: 'Mine',
    });
    const handed = await createTask(connection.db, leaver, delivery, {
        boardId,
        serverId: seed.serverId,
        title: 'For the Agent',
    });
    await assignTask(connection.db, leaver, delivery, {
        assignee: { agentId: seed.agentId, kind: 'agent' },
        expectedVersion: 1,
        serverId: seed.serverId,
        taskId: handed.task.id,
    });

    await removeServerMember(
        connection.db,
        delivery,
        { id: memberId },
        {
            confirmation: await slugOf(seed.serverId),
            serverId: seed.serverId,
        }
    );

    expect(await read(self.task.id)).toMatchObject({ assignee: null, version: 2 });
    expect(await read(handed.task.id)).toMatchObject({
        assignee: { agentId: seed.agentId, kind: 'agent' },
    });
});

test('the assignee is unassignable afterwards: a departed Agent cannot be assigned again', async () => {
    const { create, delivery, owner, seed } = await seedDepartures();
    const assignee = { agentId: seed.agentId, kind: 'agent' } as const;
    const { task } = await create('Back to nobody', assignee);
    await deleteAgent(
        connection.db,
        delivery,
        { id: seed.userId },
        {
            agentId: seed.agentId,
            confirmation: 'Ada',
            serverId: seed.serverId,
        }
    );
    await expect(
        assignTask(connection.db, owner, delivery, {
            assignee,
            expectedVersion: 2,
            serverId: seed.serverId,
            taskId: task.id,
        })
    ).rejects.toThrow('A task assignee must be an active member or Agent of this Server.');
});
