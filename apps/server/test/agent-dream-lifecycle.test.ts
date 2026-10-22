import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { dreamStaleMs } from '../src/agent-delivery/heartbeat-run.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentInboxTable, chatMessagesTable } from '../src/postgres/schema.ts';
import { dreamRows, requestDream, settledTurn } from './agent-dream-fixture.ts';
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

test('a message during a dream gets an ordinary busy notice and is handled in that run', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    expect(await requestDream(connection.db, delivery, seed)).toBe(true);
    const runId = transport.framesOfType('start').at(-1)?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });

    const messageId = await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'dm',
        chatId: seed.dmChatId,
    });
    const [notice] = transport.framesOfType('notice');
    expect(notice?.runId).toBe(runId);
    expect(notice?.inbox.map((item) => item.id)).toEqual([messageId]);

    // The Agent reads the message inside the dream turn, then the turn settles.
    const [message] = await connection.db
        .select({ sequence: chatMessagesTable.sequence })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.id, messageId));
    await delivery.onTurnSettled(
        seed.computerId,
        settledTurn(seed, runId, [
            { chatId: seed.dmChatId, id: messageId, sequence: message?.sequence ?? 0 },
        ])
    );
    const [row] = await connection.db
        .select({ state: agentInboxTable.state })
        .from(agentInboxTable)
        .where(eq(agentInboxTable.dedupeKey, messageId));
    expect(row?.state).toBe('seen');
    expect(await dreamRows(connection.db, seed)).toEqual([{ chatId: null, state: 'seen' }]);
});

test('a dream that missed its night is retired, never led', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    // Queued while the Computer was offline, then the Computer returns hours later.
    expect(await requestDream(connection.db, delivery, seed)).toBe(true);
    await connection.db
        .update(agentInboxTable)
        .set({ createdAt: new Date(Date.now() - dreamStaleMs - 60_000) })
        .where(and(eq(agentInboxTable.agentId, seed.agentId), eq(agentInboxTable.source, 'dream')));

    expect(await wake()).toBeUndefined();
    expect(transport.sent).toEqual([]);
    expect(await dreamRows(connection.db, seed)).toEqual([{ chatId: null, state: 'seen' }]);
    // The night's slot was decided once, so a repeat neither recomputes nor queues again.
    expect(await requestDream(connection.db, delivery, seed)).toBe(false);
    expect(transport.framesOfType('start')).toEqual([]);
});
