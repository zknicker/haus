import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { TaskActor } from '@haus/api';
import { eq } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentInboxTable,
    agentsTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { deleteAgent } from '../src/server-agents/delete-agent.ts';
import { removeServerMember } from '../src/servers/remove-member.ts';
import { assignTask } from '../src/tasks/task-assign.ts';
import { getTask } from '../src/tasks/task-list.ts';
import { setTaskState } from '../src/tasks/task-set-state.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { addPeerAgent, insertTaskPlace, seedTaskBoard } from './task-delivery-fixture.ts';

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

async function seedDepartures() {
    const board = await seedTaskBoard(connection.db);
    const { seed } = board;
    const { delivery } = offlineDelivery(connection.db, seed);
    const owner = { kind: 'user', userId: seed.userId } as const;
    const create = async (title: string, assignee: TaskActor, assigner: TaskActor = owner) => {
        const taskId = await insertTaskPlace(connection.db, board, title);
        return await assignTask(connection.db, assigner, delivery, {
            assignee,
            expectedVersion: 1,
            serverId: seed.serverId,
            taskId,
        });
    };
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
        handle: `bo-${userId
            .slice(-6)
            .toLowerCase()
            .replace(/[^a-z0-9]/gu, 'x')}`,
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
    const { create, delivery, owner, read, seed } = await seedDepartures();
    const assignee = { agentId: seed.agentId, kind: 'agent' } as const;
    const peerId = await addPeerAgent(connection.db, seed);

    const queued = await create('Queued', assignee);
    const finished = await create('Finished', assignee);
    const elsewhere = await create('Someone else has it', { agentId: peerId, kind: 'agent' });
    await setTaskState(connection.db, owner, delivery, {
        expectedVersion: 2,
        serverId: seed.serverId,
        state: 'done',
        taskId: finished.task.id,
    });

    const { taskEvents } = await deleteAgent(
        connection.db,
        delivery,
        { id: seed.userId },
        { agentId: seed.agentId, confirmation: 'Ada', serverId: seed.serverId }
    );

    expect(await read(queued.task.id)).toMatchObject({ assignee: null, version: 3 });
    expect(await read(finished.task.id)).toMatchObject({
        assignee: null,
        state: 'done',
        version: 4,
    });
    expect(await read(elsewhere.task.id)).toMatchObject({
        assignee: { agentId: peerId, kind: 'agent' },
        version: 2,
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

test('removing a member unassigns their Tasks and announces only the Task change', async () => {
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

    expect(await read(assigned.task.id)).toMatchObject({ assignee: null, version: 3 });
    expect(await read(kept.task.id)).toMatchObject({
        assignee: { kind: 'user', userId: seed.userId },
        version: 2,
    });
    expect(departure.taskEvents.map((event) => event.topic)).toEqual(['task.updated']);
});

test('leaving unassigns what the person held, and their assignments to others stay', async () => {
    const { create, delivery, read, seed } = await seedDepartures();
    const memberId = await addMember(seed.serverId);
    const leaver = { kind: 'user', userId: memberId } as const;
    const self = await create('Mine', leaver, leaver);
    const handed = await create('For the Agent', { agentId: seed.agentId, kind: 'agent' }, leaver);

    await removeServerMember(
        connection.db,
        delivery,
        { id: memberId },
        {
            confirmation: await slugOf(seed.serverId),
            serverId: seed.serverId,
        }
    );

    expect(await read(self.task.id)).toMatchObject({ assignee: null, version: 3 });
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
            expectedVersion: 3,
            serverId: seed.serverId,
            taskId: task.id,
        })
    ).rejects.toThrow('A task assignee must be an active member or Agent of this Server.');
});
