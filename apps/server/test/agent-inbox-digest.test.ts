import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentInboxTable } from '../src/postgres/schema.ts';
import { addChannel, deliverHuman, offlineDelivery, seedAgent } from './agent-inbox-harness.ts';
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

test('a concrete wake reports the human work queued elsewhere', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.channelId });
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.channelId });
    const fireId = createOpaqueId('rmf');
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.dmChatId,
        content: `Reminder\nfire=${fireId}`,
        createdAt: new Date(),
        dedupeKey: fireId,
        serverId: seed.serverId,
        source: 'reminder',
    });

    const start = await wake();
    expect(start).toMatchObject({ inboxDelivery: 'concrete' });
    expect(start?.drainItemIds).toEqual([fireId]);
    // The fire's own chat holds nothing else queued; the channel does.
    expect(start?.unreadElsewhere).toEqual([{ count: 2, target: '#product' }]);
    expect(start?.totalPending).toBe(2);
});

test('a drain that hits the budget reports its same-chat remainder in the unread digest', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const body = 'x'.repeat(10_000);
    for (let index = 0; index < 3; index += 1) {
        await delivery.deliver({
            agentId: seed.agentId,
            chatId: seed.dmChatId,
            content: body,
            createdAt: new Date(Date.now() + index),
            dedupeKey: createOpaqueId('rmf'),
            serverId: seed.serverId,
            source: 'reminder',
        });
    }

    const start = await wake();
    // Two fires fit the 24,000-character budget. The third is represented by no
    // row of this frame, so it surfaces as a count rather than vanishing.
    expect(start?.drainItemIds).toHaveLength(2);
    expect(start?.unreadElsewhere).toEqual([{ count: 1, target: `dm:@${seed.humanHandle}` }]);
});

test('unread elsewhere excludes every chat a notice row represents', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.channelId });
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });

    const start = await wake();
    expect(start?.inbox).toHaveLength(2);
    expect(start?.unreadElsewhere).toEqual([]);
});

test('a busy notice carries the unread digest and advances nothing', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    const channels: string[] = [];
    for (let index = 1; index <= 51; index += 1) {
        const chatId = await addChannel(connection.db, seed, `ch${String(index).padStart(2, '0')}`);
        channels.push(chatId);
        await deliverHuman(connection.db, delivery, seed, { chatId });
    }

    // The notice window holds 50 rows, so the newest chat has no row to state
    // its count and becomes a digest line instead of disappearing.
    const start = await wake();
    expect(start?.inbox).toHaveLength(50);
    expect(start?.unreadElsewhere).toEqual([{ count: 1, target: '#ch51' }]);

    await delivery.onAck({ agentId: seed.agentId, runId: start?.runId ?? '' });
    await deliverHuman(connection.db, delivery, seed, { chatId: channels[0] ?? '' });

    // The busy window must carry every unnoticed row, so the chats it drops are
    // the ones neither noticed here nor new: they stay visible as counts.
    const notice = transport.framesOfType('notice').at(-1);
    expect(notice?.unreadElsewhere).toEqual([
        { count: 1, target: '#ch49' },
        { count: 1, target: '#ch50' },
    ]);
    const advanced = await connection.db
        .select({ servedAt: agentInboxTable.servedAt, state: agentInboxTable.state })
        .from(agentInboxTable)
        .where(eq(agentInboxTable.chatId, channels[48] ?? ''));
    expect(advanced).toEqual([{ servedAt: null, state: 'queued' }]);
});
