import { afterAll, beforeAll, expect, test } from 'bun:test';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { deliverHuman, offlineDelivery, seedAgent } from './agent-inbox-harness.ts';
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

test('an addressed DM drains while its channel siblings stay notice rows', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const channelIds = [
        await deliverHuman(connection.db, delivery, seed, { chatId: seed.channelId }),
        await deliverHuman(connection.db, delivery, seed, { chatId: seed.channelId }),
    ];
    const dmId = await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'dm',
        chatId: seed.dmChatId,
    });

    const start = await wake();
    expect(start).toMatchObject({ inboxDelivery: 'notice' });
    // Oldest-first candidates, so the addressed DM rides drainItemIds while its
    // older channel siblings ride the notice rows: Raft's hybrid shape.
    expect(start?.drainItemIds).toEqual([dmId]);
    expect(start?.warmDrainItemIds).toEqual(channelIds);
    expect(start?.inbox.map((item) => item.id)).toEqual([...channelIds, dmId]);
    expect(start?.inbox.find((item) => item.id === dmId)).toMatchObject({
        addressed: true,
        addressedReason: 'dm',
    });
    expect(start?.unreadElsewhere).toEqual([]);
});

test('an unaddressed channel message ships as a warm drain candidate only', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const messageId = await deliverHuman(connection.db, delivery, seed, { chatId: seed.channelId });

    const start = await wake();
    expect(start?.drainItemIds).toEqual([]);
    expect(start?.warmDrainItemIds).toEqual([messageId]);
    expect(start?.inbox[0]?.addressed).toBeUndefined();
});

test('a resent active run reproduces the same drain sets and digest', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.channelId });
    await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'mention',
        chatId: seed.dmChatId,
    });
    const first = await wake();

    await delivery.onAck({ agentId: seed.agentId, runId: first?.runId ?? '' });
    await delivery.dispatchAgent(seed.agentId, seed.serverId, { resendActive: true });

    const resent = transport.framesOfType('start').at(-1);
    expect(resent?.runId).toBe(first?.runId ?? '');
    expect(resent?.drainItemIds).toEqual(first?.drainItemIds ?? []);
    expect(resent?.warmDrainItemIds).toEqual(first?.warmDrainItemIds ?? []);
    expect(resent?.unreadElsewhere).toEqual(first?.unreadElsewhere ?? []);
});

test('a resend does not widen the drain sets past the drain budget', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    const body = 'x'.repeat(10_000);
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
        ids.push(
            await deliverHuman(connection.db, delivery, seed, {
                chatId: seed.channelId,
                content: body,
            })
        );
    }

    // All three ride the notice rows; only the two inside the 24,000-character
    // budget may become bodies.
    const first = await wake();
    expect(first?.inbox.map((item) => item.id)).toEqual(ids);
    expect(first?.warmDrainItemIds).toEqual(ids.slice(0, 2));

    await delivery.onAck({ agentId: seed.agentId, runId: first?.runId ?? '' });
    await delivery.dispatchAgent(seed.agentId, seed.serverId, { resendActive: true });

    const resent = transport.framesOfType('start').at(-1);
    expect(resent?.runId).toBe(first?.runId ?? '');
    expect(resent?.warmDrainItemIds).toEqual(first?.warmDrainItemIds ?? []);
    expect(resent?.drainItemIds).toEqual(first?.drainItemIds ?? []);
});
