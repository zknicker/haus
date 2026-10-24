import { afterAll, beforeAll, expect, test } from 'bun:test';
import { heartbeatContextLimit } from '@haus/api';
import { eq } from 'drizzle-orm';
import { readHeartbeatContext } from '../src/agent-delivery/heartbeat-context.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentLeadsTable,
    agentMcpConnectionGrantsTable,
    agentsTable,
    chatMessagesTable,
    mcpConnectionsTable,
    remindersTable,
} from '../src/postgres/schema.ts';
import { agentSpeaks, requestHeartbeat } from './agent-dream-fixture.ts';
import { offlineDelivery, type Seed, seedAgent } from './agent-inbox-harness.ts';
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

async function connect(
    seed: Seed,
    name: string,
    options: { connected: boolean; granted: boolean }
) {
    const id = `mcp_${createOpaqueId('x').slice(-16).padStart(16, 'a')}`;
    await connection.db.insert(mcpConnectionsTable).values({
        auth: 'none',
        connected: options.connected,
        headerNames: [],
        id,
        name,
        serverId: seed.serverId,
        tools: [],
        url: `https://example.test/${id}`,
    });
    if (options.granted) {
        await connection.db
            .insert(agentMcpConnectionGrantsTable)
            .values({ agentId: seed.agentId, connectionId: id, serverId: seed.serverId });
    }
}

async function lead(seed: Seed, topic: string, minutesAgo: number, done = false) {
    await connection.db.insert(agentLeadsTable).values({
        agentId: seed.agentId,
        createdAt: new Date(Date.now() - minutesAgo * 60_000),
        doneAt: done ? new Date() : null,
        id: createOpaqueId('led'),
        serverId: seed.serverId,
        topic,
    });
}

async function remind(
    seed: Seed,
    anchorMessageId: string,
    title: string,
    fireAt: Date,
    status: 'canceled' | 'fired' | 'scheduled' = 'scheduled'
) {
    await connection.db.insert(remindersTable).values({
        anchorChatId: seed.channelId,
        anchorMessageId,
        createdAt: new Date(),
        fireAt,
        id: createOpaqueId('rem'),
        ownerAgentId: seed.agentId,
        serverId: seed.serverId,
        status,
        timezone: 'UTC',
        title,
        updatedAt: new Date(),
    });
}

test('the heartbeat context lists granted connections, open leads, and scheduled reminders, bounded', async () => {
    const seed = await seedAgent(connection.db);
    await connect(seed, 'Etsy', { connected: true, granted: true });
    await connect(seed, 'Linear', { connected: true, granted: true });
    await connect(seed, 'Ungranted', { connected: true, granted: false });
    await connect(seed, 'Disconnected', { connected: false, granted: true });
    await lead(seed, 'Older open lead', 20);
    await lead(seed, 'Newest open lead', 5);
    await lead(seed, 'Finished lead', 10, true);
    await lead(seed, 'Stale lead', 9 * 24 * 60);
    const anchor = createOpaqueId('msg');
    await connection.db.insert(chatMessagesTable).values({
        authorUserId: seed.userId,
        chatId: seed.channelId,
        content: 'remind me',
        createdAt: new Date(),
        id: anchor,
        nonce: createOpaqueId('nonce'),
        sequence: 1,
        serverId: seed.serverId,
    });
    await remind(seed, anchor, 'Later', new Date('2026-10-23T09:00:00.000Z'));
    await remind(seed, anchor, 'Sooner', new Date('2026-10-22T09:00:00.000Z'));
    await remind(seed, anchor, 'Done', new Date('2026-10-21T09:00:00.000Z'), 'fired');

    const context = await readHeartbeatContext(connection.db, seed);

    expect(context.connections).toEqual(['Etsy', 'Linear']);
    expect(context.leads.map((item) => item.topic)).toEqual([
        'Newest open lead',
        'Older open lead',
    ]);
    expect(context.reminders.map((item) => [item.title, item.fireAt])).toEqual([
        ['Sooner', '2026-10-22T09:00:00.000Z'],
        ['Later', '2026-10-23T09:00:00.000Z'],
    ]);
    for (let index = 0; index < heartbeatContextLimit + 2; index += 1) {
        await lead(seed, `Extra ${index}`, index);
    }
    expect((await readHeartbeatContext(connection.db, seed)).leads).toHaveLength(
        heartbeatContextLimit
    );
});

test("a retired Agent's unfinished lead is not listed as held", async () => {
    const seed = await seedAgent(connection.db);
    await lead(seed, 'Memphis shipping cutoff', 5);
    await connection.db
        .update(agentsTable)
        .set({ retiredAt: new Date() })
        .where(eq(agentsTable.id, seed.agentId));

    expect((await readHeartbeatContext(connection.db, seed)).leads).toEqual([]);
});

test('a heartbeat start frame carries the context', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await connect(seed, 'Etsy', { connected: true, granted: true });
    await lead(seed, 'Open lead', 1);
    await agentSpeaks(connection.db, seed);

    expect(await requestHeartbeat(connection.db, delivery, seed, 'nightly')).toBe(true);
    const heartbeat = transport.framesOfType('start').at(-1)?.heartbeat;
    expect(heartbeat?.connections).toEqual(['Etsy']);
    expect(heartbeat?.leads.map((item) => item.topic)).toEqual(['Open lead']);
    expect(heartbeat?.reminders).toEqual([]);
});
