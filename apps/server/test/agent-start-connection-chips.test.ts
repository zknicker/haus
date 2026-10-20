import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { type AgentCommand, rankWranglerMcpUrl } from '@haus/api';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
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

test('a start carries product chips only while the Server has RankWrangler connected', async () => {
    expect(await startChips({ connected: true, tools: ['rankwrangler_product'] })).toEqual([
        'amazon-product',
    ]);
    expect(await startChips({ connected: false, tools: [] })).toEqual([]);
    expect(await startChips(null)).toEqual([]);
});

class FakeTransport implements DeliveryTransport {
    readonly sent: AgentCommand[] = [];
    constructor(private readonly computerId: string) {}

    isOnline(computerId: string): boolean {
        return computerId === this.computerId;
    }

    send(computerId: string, frame: AgentCommand): boolean {
        this.sent.push(frame);
        return computerId === this.computerId;
    }
}

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
            url: rankWranglerMcpUrl,
        });
    }
    const transport = new FakeTransport(seed.computerId);
    await new AgentDelivery(connection.db, transport).deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'Compare B07XN9T11R.',
        dedupeKey: 'msg-chips',
        serverId: seed.serverId,
    });
    const start = transport.sent.find((frame) => frame.type === 'start');
    return start?.type === 'start' ? start.connectionChips : null;
}

async function seedAgent() {
    const db = connection.db;
    const userId = createOpaqueId('usr');
    const serverId = createOpaqueId('srv');
    const computerId = createOpaqueId('cmp');
    const agentId = createOpaqueId('agt');
    const chatId = createOpaqueId('cht');
    await db.insert(usersTable).values({ clerkUserId: createOpaqueId('clk'), id: userId });
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
        serverId,
    });
    await db.insert(chatsTable).values({
        dmAgentId: agentId,
        dmMemberOneStint: 1,
        dmMemberOneUserId: userId,
        id: chatId,
        kind: 'dm',
        serverId,
    });
    return { agentId, chatId, computerId, serverId };
}
