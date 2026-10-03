import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import type { AgentCommand } from '@haus/api';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentsTable,
    chatsTable,
    computersTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

const personality = 'Terse. Plain words. Dry humor.';

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

    isOnline(computerId: string): boolean {
        return this.online.has(computerId);
    }

    send(computerId: string, frame: AgentCommand): boolean {
        if (!this.online.has(computerId)) {
            return false;
        }
        this.sent.push(frame);
        return true;
    }
}

test('a live dispatch carries the personality on the start frame and nowhere else', async () => {
    const seed = await seedAgent(personality);
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'Draft the notes.',
        dedupeKey: 'msg-live',
        serverId: seed.serverId,
    });

    expectPersonalityOnlyOnStart(transport.sent);
});

test('a reconnect replay rebuilds the same personality from durable state', async () => {
    const seed = await seedAgent(personality);
    const transport = new FakeTransport();
    const delivery = new AgentDelivery(connection.db, transport);
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'Draft the notes.',
        dedupeKey: 'msg-replay',
        serverId: seed.serverId,
    });

    transport.online.add(seed.computerId);
    await delivery.onComputerReconnect(seed.computerId);

    expectPersonalityOnlyOnStart(transport.sent);
});

test('an Agent without a personality starts with no personality field', async () => {
    const seed = await seedAgent(null);
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'Draft the notes.',
        dedupeKey: 'msg-none',
        serverId: seed.serverId,
    });

    const start = transport.sent.find((frame) => frame.type === 'start');
    expect(start).toBeDefined();
    expect(start && 'agentPersonality' in start).toBe(false);
});

function expectPersonalityOnlyOnStart(sent: AgentCommand[]) {
    const starts = sent.filter((frame) => frame.type === 'start');
    expect(starts).toHaveLength(1);
    const [start] = starts;
    expect(start?.type === 'start' && start.agentPersonality).toBe(personality);
    expect(start?.type === 'start' && start.agentDescription).toBe('Keeps release notes current.');
    // The envelope other Agents' messages ride, and every other frame, stays personality-free.
    expect(JSON.stringify(start?.type === 'start' ? start.inbox : null)).not.toContain(personality);
    for (const frame of sent.filter((candidate) => candidate.type !== 'start')) {
        expect(JSON.stringify(frame)).not.toContain(personality);
    }
}

async function seedAgent(agentPersonality: string | null) {
    const db = connection.db;
    const userId = createOpaqueId('usr');
    const serverId = createOpaqueId('srv');
    const computerId = createOpaqueId('cmp');
    const agentId = createOpaqueId('agt');
    const chatId = createOpaqueId('cht');
    await db.insert(usersTable).values({ clerkUserId: createOpaqueId('clk'), id: userId });
    await db
        .insert(serversTable)
        .values({ displayName: 'Personality', id: serverId, slug: createOpaqueId('slug') });
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
        description: 'Keeps release notes current.',
        desiredModelId: 'fake-model',
        desiredRuntimeId: 'fake',
        displayName: 'Orbit',
        handle: `orbit-${randomBytes(4).toString('hex')}`,
        homeTimezone: 'UTC',
        id: agentId,
        personality: agentPersonality,
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
