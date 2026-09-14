import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import type { AgentCommand } from '@haus/api';
import { and, asc, eq } from 'drizzle-orm';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentActivityTable,
    agentsTable,
    chatsTable,
    computersTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';
import {
    appendServerAgentActivity,
    recordComputerAgentActivity,
    recordComputerAgentActivityWithStatus,
} from '../src/server-agents/agent-activity.ts';
import {
    listAgentActivityHistory,
    readActiveAgentActivity,
} from '../src/server-agents/agent-activity-history.ts';
import { lockServerRow } from '../src/servers/server-lock.ts';
import { activityFrame, summary } from './agent-activity-fixture.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

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

class FakeTransport implements DeliveryTransport {
    readonly online = new Set<string>();
    readonly sent: AgentCommand[] = [];

    isOnline(computerId: string) {
        return this.online.has(computerId);
    }

    send(computerId: string, frame: AgentCommand) {
        if (!this.online.has(computerId)) {
            return false;
        }
        this.sent.push(frame);
        return true;
    }
}

interface Seed {
    agentId: string;
    chatId: string;
    computerId: string;
    serverId: string;
}

async function seedActivity(): Promise<Seed> {
    const userId = createOpaqueId('usr');
    const serverId = createOpaqueId('srv');
    const computerId = createOpaqueId('cmp');
    const agentId = createOpaqueId('agt');
    const chatId = createOpaqueId('cht');
    await connection.db
        .insert(usersTable)
        .values({ clerkUserId: createOpaqueId('clk'), id: userId });
    await connection.db.insert(serversTable).values({
        displayName: 'Activity',
        id: serverId,
        slug: `activity-${randomBytes(4).toString('hex')}`,
    });
    await connection.db.insert(serverMembershipsTable).values({
        handle: `human-${randomBytes(4).toString('hex')}`,
        id: createOpaqueId('mem'),
        role: 'owner',
        serverId,
        userId,
    });
    await connection.db.insert(computersTable).values({
        attachedByUserId: userId,
        credentialHash: randomBytes(32).toString('hex'),
        health: 'healthy',
        id: computerId,
        serverId,
    });
    await connection.db.insert(agentsTable).values({
        computerId,
        desiredModelId: 'fake-model',
        desiredRuntimeId: 'fake',
        displayName: 'Ada',
        handle: `ada-${randomBytes(4).toString('hex')}`,
        homeTimezone: 'UTC',
        id: agentId,
        serverId,
    });
    await connection.db.insert(chatsTable).values({
        dmAgentId: agentId,
        dmMemberOneStint: 1,
        dmMemberOneUserId: userId,
        id: chatId,
        kind: 'dm',
        serverId,
    });
    return { agentId, chatId, computerId, serverId };
}

async function startRun(seed: Seed) {
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'activity work',
        dedupeKey: createOpaqueId('msg'),
        serverId: seed.serverId,
    });
    const frame = transport.sent.find(
        (item): item is Extract<AgentCommand, { type: 'start' }> => item.type === 'start'
    );
    if (!frame) {
        throw new Error('The test run did not start.');
    }
    return { delivery, frame, transport };
}

test('deduplicates out-of-order Computer frames and interleaves by Server position', async () => {
    const seed = await seedActivity();
    const { delivery, frame } = await startRun(seed);
    await delivery.onAck({ agentId: seed.agentId, runId: frame.runId });
    const first = await recordComputerAgentActivity(connection.db, {
        computerId: seed.computerId,
        frame: activityFrame(seed, frame.runId, 2),
        serverId: seed.serverId,
    });
    const serverEvent = await connection.db.transaction(async (tx) => {
        await lockServerRow(tx, seed.serverId);
        return await appendServerAgentActivity(tx, {
            agentId: seed.agentId,
            category: 'sending_message',
            phase: 'completed',
            runId: frame.runId,
            serverId: seed.serverId,
        });
    });
    const second = await recordComputerAgentActivity(connection.db, {
        computerId: seed.computerId,
        frame: activityFrame(seed, frame.runId, 1),
        serverId: seed.serverId,
    });
    const duplicate = await recordComputerAgentActivity(connection.db, {
        computerId: seed.computerId,
        frame: activityFrame(seed, frame.runId, 2),
        serverId: seed.serverId,
    });
    const duplicateStatus = await recordComputerAgentActivityWithStatus(connection.db, {
        computerId: seed.computerId,
        frame: activityFrame(seed, frame.runId, 2),
        serverId: seed.serverId,
    });

    expect(first?.position).toBe(2);
    expect(serverEvent?.position).toBe(3);
    expect(second?.position).toBe(4);
    expect(duplicate).toEqual(first);
    expect(duplicateStatus).toEqual({ event: first, inserted: false });
    const rows = await connection.db
        .select({ category: agentActivityTable.category, position: agentActivityTable.position })
        .from(agentActivityTable)
        .where(
            and(
                eq(agentActivityTable.agentId, seed.agentId),
                eq(agentActivityTable.runId, frame.runId)
            )
        )
        .orderBy(asc(agentActivityTable.position));
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3, 4]);
    expect(rows.map((row) => row.category)).toEqual([
        'starting_work',
        'using_tool',
        'sending_message',
        'using_tool',
    ]);

    const firstPage = await listAgentActivityHistory(connection.db, {
        agentId: seed.agentId,
        limit: 2,
        runId: frame.runId,
        serverId: seed.serverId,
    });
    const secondPage = await listAgentActivityHistory(connection.db, {
        agentId: seed.agentId,
        before: firstPage.nextBefore ?? undefined,
        limit: 2,
        runId: frame.runId,
        serverId: seed.serverId,
    });
    expect(firstPage.events.map((event) => event.position)).toEqual([4, 3]);
    expect(secondPage.events.map((event) => event.position)).toEqual([2, 1]);
    expect(secondPage.nextBefore).toBeNull();
});
test('persists instruction refresh activity in agent history', async () => {
    const seed = await seedActivity();
    const { delivery, frame } = await startRun(seed);
    await delivery.onAck({ agentId: seed.agentId, runId: frame.runId });

    const activity = await recordComputerAgentActivity(connection.db, {
        computerId: seed.computerId,
        frame: {
            ...activityFrame(seed, frame.runId, 1),
            category: 'updating_instructions',
        },
        serverId: seed.serverId,
    });
    const history = await listAgentActivityHistory(connection.db, {
        agentId: seed.agentId,
        limit: 10,
        runId: frame.runId,
        serverId: seed.serverId,
    });

    expect(activity?.category).toBe('updating_instructions');
    expect(history.events[0]?.category).toBe('updating_instructions');
});

test('rejects wrong identities and settled runs, while active snapshot recovers the latest event', async () => {
    const seed = await seedActivity();
    const { delivery, frame } = await startRun(seed);
    expect(await readActiveAgentActivity(connection.db, seed.serverId)).toEqual({
        activities: [],
    });
    const wrongComputer = await recordComputerAgentActivity(connection.db, {
        computerId: createOpaqueId('cmp'),
        frame: activityFrame(seed, frame.runId, 1),
        serverId: seed.serverId,
    });
    const wrongAgent = await recordComputerAgentActivity(connection.db, {
        computerId: seed.computerId,
        frame: { ...activityFrame(seed, frame.runId, 2), agentId: createOpaqueId('agt') },
        serverId: seed.serverId,
    });
    const wrongServer = await recordComputerAgentActivity(connection.db, {
        computerId: seed.computerId,
        frame: activityFrame(seed, frame.runId, 3),
        serverId: createOpaqueId('srv'),
    });
    expect(wrongComputer).toBeNull();
    expect(wrongAgent).toBeNull();
    expect(wrongServer).toBeNull();
    const unaccepted = await recordComputerAgentActivity(connection.db, {
        computerId: seed.computerId,
        frame: activityFrame(seed, frame.runId, 1),
        serverId: seed.serverId,
    });
    expect(unaccepted).toBeNull();

    await delivery.onAck({ agentId: seed.agentId, runId: frame.runId });

    const accepted = await recordComputerAgentActivity(connection.db, {
        computerId: seed.computerId,
        frame: activityFrame(seed, frame.runId, 1),
        serverId: seed.serverId,
    });
    const snapshot = await readActiveAgentActivity(connection.db, seed.serverId);
    expect(snapshot.activities).toHaveLength(1);
    const history = await listAgentActivityHistory(connection.db, {
        agentId: seed.agentId,
        serverId: seed.serverId,
        runId: frame.runId,
        limit: 50,
    });
    const runStartedAt = history.events.find(
        (event) => event.category === 'starting_work'
    )?.occurredAt;
    expect(runStartedAt).toBeString();
    expect(snapshot.activities[0]).toEqual({ ...accepted, runStartedAt });

    const finishing = await connection.db.transaction(async (tx) => {
        await lockServerRow(tx, seed.serverId);
        return await appendServerAgentActivity(tx, {
            agentId: seed.agentId,
            category: 'sending_message',
            phase: 'completed',
            runId: frame.runId,
            serverId: seed.serverId,
        });
    });
    await recordComputerAgentActivity(connection.db, {
        computerId: seed.computerId,
        frame: {
            ...activityFrame(seed, frame.runId, 2),
            phase: 'completed',
        },
        serverId: seed.serverId,
    });
    expect((await readActiveAgentActivity(connection.db, seed.serverId)).activities).toEqual([
        { ...finishing, runStartedAt },
    ]);

    const resumed = await recordComputerAgentActivity(connection.db, {
        computerId: seed.computerId,
        frame: activityFrame(seed, frame.runId, 3),
        serverId: seed.serverId,
    });
    expect((await readActiveAgentActivity(connection.db, seed.serverId)).activities).toEqual([
        { ...resumed, runStartedAt },
    ]);

    await connection.db
        .update(computersTable)
        .set({ health: 'offline' })
        .where(eq(computersTable.id, seed.computerId));
    expect((await readActiveAgentActivity(connection.db, seed.serverId)).activities).toEqual([]);
    await connection.db
        .update(computersTable)
        .set({ health: 'healthy' })
        .where(eq(computersTable.id, seed.computerId));

    await delivery.onTurnSettled(seed.computerId, summary(seed, frame.runId));
    const stale = await recordComputerAgentActivity(connection.db, {
        computerId: seed.computerId,
        frame: activityFrame(seed, frame.runId, 4),
        serverId: seed.serverId,
    });
    expect(stale).toBeNull();
    expect((await readActiveAgentActivity(connection.db, seed.serverId)).activities).toEqual([]);

    const nextRun = await startRun(seed);
    const allRuns = await listAgentActivityHistory(connection.db, {
        agentId: seed.agentId,
        limit: 1,
        serverId: seed.serverId,
    });
    expect(allRuns.events[0]?.runId).toBe(nextRun.frame.runId);
});
