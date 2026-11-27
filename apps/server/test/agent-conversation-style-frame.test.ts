import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import type { AgentCommand } from '@haus/api';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import { requireCaptainChatId } from '../src/chats/captain-chat.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentsTable,
    computersTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { testAgentHome } from './agent-home.ts';
import { deliverHumanMessage } from './human-message.fixture.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { RecordingRunner } from './recording-runner.ts';

const conversationStyle = 'Terse. Plain words. Dry humor.';

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

test('a live dispatch carries the conversation style and emoji on the start frame and nowhere else', async () => {
    const seed = await seedAgent(conversationStyle, '🦊');
    const transport = new FakeTransport();
    const runner = new RecordingRunner();
    transport.online.add(seed.computerId);
    runner.attach(seed.agentId);
    const delivery = new AgentDelivery(connection.db, transport, undefined, runner);

    await deliverHumanMessage(connection.db, delivery, {
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'Draft the notes.',
        dedupeKey: `msg_live_${seed.serverId}`,
        serverId: seed.serverId,
    });

    expectStyleOnlyOnStart(runner, transport.sent);
});

test('a reconnect replay rebuilds the same conversation style from durable state', async () => {
    const seed = await seedAgent(conversationStyle, '🦊');
    const transport = new FakeTransport();
    const runner = new RecordingRunner();
    const delivery = new AgentDelivery(connection.db, transport, undefined, runner);
    await deliverHumanMessage(connection.db, delivery, {
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'Draft the notes.',
        dedupeKey: `msg_replay_${seed.serverId}`,
        serverId: seed.serverId,
    });

    transport.online.add(seed.computerId);
    runner.attach(seed.agentId);
    await delivery.onComputerReconnect(seed.computerId);

    expectStyleOnlyOnStart(runner, transport.sent);
});

test('an Agent without a conversation style starts with no style and a null emoji', async () => {
    const seed = await seedAgent(null, null);
    const transport = new FakeTransport();
    const runner = new RecordingRunner();
    transport.online.add(seed.computerId);
    runner.attach(seed.agentId);
    const delivery = new AgentDelivery(connection.db, transport, undefined, runner);

    await deliverHumanMessage(connection.db, delivery, {
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'Draft the notes.',
        dedupeKey: `msg_none_${seed.serverId}`,
        serverId: seed.serverId,
    });

    const [start] = runner.starts();
    expect(start).toBeDefined();
    expect(start && 'agentConversationStyle' in start).toBe(false);
    expect(start?.agentSignatureEmoji).toBeNull();
});

function expectStyleOnlyOnStart(runner: RecordingRunner, computerFrames: AgentCommand[]) {
    const starts = runner.starts();
    expect(starts).toHaveLength(1);
    const [start] = starts;
    expect(start?.agentConversationStyle).toBe(conversationStyle);
    expect(start?.agentSignatureEmoji).toBe('🦊');
    expect(start?.agentDescription).toBe('Keeps release notes current.');
    expect(JSON.stringify(start?.inbox ?? null)).not.toContain(conversationStyle);
    const others = [
        ...computerFrames,
        ...runner.sent.filter((candidate) => candidate.type !== 'runner-start'),
    ];
    for (const frame of others) {
        expect(JSON.stringify(frame)).not.toContain(conversationStyle);
    }
}

async function seedAgent(agentConversationStyle: string | null, signatureEmoji: string | null) {
    const db = connection.db;
    const userId = createOpaqueId('usr');
    const serverId = createOpaqueId('srv');
    const computerId = createOpaqueId('cmp');
    const agentId = createOpaqueId('agt');
    await db.insert(usersTable).values({ authSubject: createOpaqueId('clk'), id: userId });
    await db
        .insert(serversTable)
        .values({ displayName: 'Conversation style', id: serverId, slug: createOpaqueId('slug') });
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
        conversationStyle: agentConversationStyle,
        homeProjectId: await testAgentHome(db, serverId),
        serverId,
        signatureEmoji,
    });
    const chatId = await requireCaptainChatId(db, { agentId, serverId });
    return { agentId, chatId, computerId, serverId };
}
