import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentsTable,
    chatsTable,
    computersTable,
    mcpConnectionsTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { testAgentHome } from './agent-home.ts';
import { deliverHumanMessage } from './human-message.fixture.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { RecordingRunner } from './recording-runner.ts';

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

test('a start carries product chips only while the Server has RankWrangler connected', async () => {
    expect(await startChips({ connected: true, tools: ['rankwrangler_product'] })).toEqual([
        'amazon-product',
    ]);
    expect(await startChips({ connected: false, tools: [] })).toEqual([]);
    expect(await startChips(null)).toEqual([]);
});

async function startChips(rankWrangler: { connected: boolean; tools: string[] } | null) {
    const seed = await seedAgent();
    if (rankWrangler) {
        await connection.db.insert(mcpConnectionsTable).values({
            ...rankWrangler,
            auth: 'oauth',
            headerNames: [],
            id: `mcp_${randomBytes(8).toString('hex')}`,
            name: 'RankWrangler',
            preset: 'rankwrangler',
            serverId: seed.serverId,
            url: 'https://rankwrangler.merchbase.co/mcp',
        });
    }
    const runner = new RecordingRunner();
    runner.attach(seed.agentId);
    const transport: DeliveryTransport = { isOnline: () => true, send: () => true };
    await deliverHumanMessage(
        connection.db,
        new AgentDelivery(connection.db, transport, undefined, runner),
        {
            agentId: seed.agentId,
            chatId: seed.chatId,
            content: 'Compare B07XN9T11R.',
            dedupeKey: `msg_chips_${seed.serverId}`,
            serverId: seed.serverId,
        }
    );
    return runner.starts()[0]?.connectionChips ?? null;
}

async function seedAgent() {
    const db = connection.db;
    const userId = createOpaqueId('usr');
    const serverId = createOpaqueId('srv');
    const computerId = createOpaqueId('cmp');
    const agentId = createOpaqueId('agt');
    const chatId = createOpaqueId('cht');
    await db.insert(usersTable).values({ authSubject: createOpaqueId('clk'), id: userId });
    await db
        .insert(serversTable)
        .values({ displayName: 'Chips', id: serverId, slug: createOpaqueId('slug') });
    await db.insert(serverMembershipsTable).values({
        handle: `human-${randomBytes(4).toString('hex')}`,
        id: createOpaqueId('mem'),
        role: 'owner',
        serverId,
        userId,
    });
    await db.insert(computersTable).values({
        attachedByUserId: userId,
        credentialHash: randomBytes(32).toString('hex'),
        id: computerId,
        serverId,
    });
    await db.insert(agentsTable).values({
        computerId,
        desiredModelId: 'fake-model',
        desiredRuntimeId: 'fake',
        displayName: 'Orbit',
        handle: `orbit-${randomBytes(4).toString('hex')}`,
        homeTimezone: 'UTC',
        id: agentId,
        homeProjectId: await testAgentHome(db, serverId),
        serverId,
    });
    await db.insert(chatsTable).values({
        captainAgentId: agentId,
        id: chatId,
        kind: 'captain',
        serverId,
    });
    return { agentId, chatId, computerId, serverId };
}
