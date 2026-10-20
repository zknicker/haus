import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import * as store from '../src/agent-delivery/store.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentInboxTable } from '../src/postgres/schema.ts';
import { requestDream, requestHeartbeat, settledTurn } from './agent-dream-fixture.ts';
import { deliverHuman, offlineDelivery, type Seed, seedAgent } from './agent-inbox-harness.ts';
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

function rowStates(seed: Seed, source: string) {
    return connection.db
        .select({ state: agentInboxTable.state })
        .from(agentInboxTable)
        .where(and(eq(agentInboxTable.agentId, seed.agentId), eq(agentInboxTable.source, source)));
}

async function startDaytime() {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    expect(await requestHeartbeat(connection.db, delivery, seed, 'daytime')).toBe(true);
    const heartbeat = transport.framesOfType('start').at(-1);
    await delivery.onAck({ agentId: seed.agentId, runId: heartbeat?.runId ?? '' });
    return { delivery, heartbeat, seed, transport };
}

test('a DM during a daytime run stops that run, retires it, and starts the DM', async () => {
    const { delivery, heartbeat, seed, transport } = await startDaytime();

    await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'dm',
        chatId: seed.dmChatId,
    });

    expect(transport.framesOfType('stop').map((frame) => frame.runId)).toEqual([heartbeat?.runId]);
    const next = transport.framesOfType('start').at(-1);
    expect(next).toMatchObject({ chatId: seed.dmChatId });
    expect(next?.runId).not.toBe(heartbeat?.runId);
    // Retired as seen, so the slot is not retried; the Agent itself is not stopped.
    expect(await rowStates(seed, 'heartbeat')).toEqual([{ state: 'seen' }]);
    expect((await store.readDeliveryState(connection.db, seed.agentId))?.stopped).toBe(false);

    // The stopped run's late summary is a no-op for the new run.
    await delivery.onTurnSettled(seed.computerId, {
        ...settledTurn(seed, heartbeat?.runId ?? ''),
        status: 'interrupted',
    });
    expect((await store.readDeliveryState(connection.db, seed.agentId))?.activeRunId).toBe(
        next?.runId
    );
});

test('an ambient message does not stop a daytime run', async () => {
    const { delivery, seed, transport } = await startDaytime();

    await deliverHuman(connection.db, delivery, seed, { chatId: seed.channelId });

    expect(transport.framesOfType('stop')).toEqual([]);
    expect(await rowStates(seed, 'heartbeat')).toEqual([{ state: 'served' }]);
});

test('the nightly dream never yields', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    expect(await requestDream(connection.db, delivery, seed)).toBe(true);
    const dream = transport.framesOfType('start').at(-1);
    await delivery.onAck({ agentId: seed.agentId, runId: dream?.runId ?? '' });

    await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'dm',
        chatId: seed.dmChatId,
    });

    expect(transport.framesOfType('stop')).toEqual([]);
    expect((await store.readDeliveryState(connection.db, seed.agentId))?.activeRunId).toBe(
        dream?.runId
    );
});
