import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import type { AgentCommand } from '@haus/api';
import { eq } from 'drizzle-orm';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import { readDeliveryState } from '../src/agent-delivery/store.ts';
import { createCaptainChat } from '../src/chats/captain-chat.ts';
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

test('a runner reconnect ends a run whose chat was deleted and redelivers its other work', async () => {
    const seed = await seedAgent();
    const runner = new RecordingRunner();
    const delivery = new AgentDelivery(connection.db, new OnlineTransport(), undefined, runner);
    for (const [chatId, content] of [
        [seed.channelId, 'from the deleted channel'],
        [seed.captainChatId, 'from the Captain chat'],
    ] as const) {
        await deliverHumanMessage(connection.db, delivery, {
            agentId: seed.agentId,
            chatId,
            content,
            dedupeKey: createOpaqueId('msg'),
            serverId: seed.serverId,
        });
    }
    runner.attach(seed.agentId);
    await delivery.onRunnerReconnect();
    const first = runner.starts()[0];
    expect(first?.chatId).toBe(seed.channelId);
    await delivery.onAck({ agentId: seed.agentId, runId: first?.runId ?? '' });

    await connection.db.delete(chatsTable).where(eq(chatsTable.id, seed.channelId));
    await delivery.onRunnerReconnect();

    const next = runner.starts()[1];
    expect(next?.runId).not.toBe(first?.runId);
    expect(next?.chatId).toBe(seed.captainChatId);
    expect(next?.inbox.map((item) => item.content)).toEqual(['from the Captain chat']);
    expect((await readDeliveryState(connection.db, seed.agentId))?.activeRunId).toBe(next?.runId);
});

class OnlineTransport implements DeliveryTransport {
    isOnline() {
        return true;
    }

    send(_computerId: string, _frame: AgentCommand) {
        return true;
    }
}

async function seedAgent() {
    const db = connection.db;
    const userId = createOpaqueId('usr');
    const serverId = createOpaqueId('srv');
    const computerId = createOpaqueId('cmp');
    const agentId = createOpaqueId('agt');
    const channelId = createOpaqueId('cht');
    await db.insert(usersTable).values({ authSubject: createOpaqueId('clk'), id: userId });
    await db
        .insert(serversTable)
        .values({ displayName: 'Deleted chat', id: serverId, slug: createOpaqueId('slug') });
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
        displayName: 'Ada',
        handle: `ada-${randomBytes(4).toString('hex')}`,
        homeProjectId: await testAgentHome(db, serverId),
        homeTimezone: 'UTC',
        id: agentId,
        serverId,
    });
    await db.insert(chatsTable).values({
        id: channelId,
        kind: 'channel',
        name: `room-${randomBytes(4).toString('hex')}`,
        serverId,
    });
    const captainChatId = await createCaptainChat(db, { agentId, ownerUserId: null, serverId });
    return { agentId, captainChatId, channelId, serverId };
}
