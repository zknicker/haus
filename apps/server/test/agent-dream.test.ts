import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import * as store from '../src/agent-delivery/store.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentRunTriggersTable } from '../src/postgres/schema.ts';
import { agentTurnTrigger } from '../src/server-agents/agent-turn-trigger.ts';
import {
    agentSpeaks,
    dreamRows as readDreamRows,
    requestDream,
    requestHeartbeat,
    settledTurn,
} from './agent-dream-fixture.ts';
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

const dream = (delivery: AgentDelivery, seed: Seed) => requestDream(connection.db, delivery, seed);
const completed = (seed: Seed, runId: string) => settledTurn(seed, runId);
const dreamRows = (seed: Seed) => readDreamRows(connection.db, seed);

test('an idle Agent gets one chatless dream run, recorded with a dream trigger', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);

    expect(await dream(delivery, seed)).toBe(true);

    const [start] = transport.framesOfType('start');
    expect(start).toMatchObject({
        chatId: null,
        heartbeat: { id: `dream:${seed.agentId}:2026-10-11`, kind: 'nightly', since: null },
        drainItemIds: [],
        inbox: [],
        inboxDelivery: 'concrete',
        totalPending: 0,
        unreadElsewhere: [],
    });
    const [trigger] = await connection.db
        .select()
        .from(agentRunTriggersTable)
        .where(eq(agentRunTriggersTable.runId, start?.runId ?? ''));
    expect(trigger).toMatchObject({ chatId: null, source: 'dream' });
    expect(
        agentTurnTrigger({ chatId: null, source: 'dream', visible: false, workId: 'w' })
    ).toEqual({ added: 0, kind: 'dream', learned: null, removed: 0 });

    // A resend reproduces the same chatless frame.
    await delivery.dispatchAgent(seed.agentId, seed.serverId, { resendActive: true });
    expect(transport.framesOfType('start').at(-1)).toEqual(start);

    await delivery.onTurnSettled(seed.computerId, completed(seed, start?.runId ?? ''));
    expect(await dreamRows(seed)).toEqual([{ chatId: null, state: 'seen' }]);
    expect((await store.readDeliveryState(connection.db, seed.agentId))?.activeRunId).toBeNull();

    // The same Computer-local night is a no-op; it never starts a second run.
    const frames = transport.framesOfType('start').length;
    await dream(delivery, seed);
    expect(transport.framesOfType('start')).toHaveLength(frames);
    expect(await dreamRows(seed)).toHaveLength(1);
});

test('a stopped or foreign Agent is never queued a dream', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);

    await store.setStopped(connection.db, { ...seed, stopped: true });
    await agentSpeaks(connection.db, seed);
    expect(await requestHeartbeat(connection.db, delivery, seed, 'nightly')).toBe(false);
    await store.setStopped(connection.db, { ...seed, stopped: false });

    await agentSpeaks(connection.db, seed);
    expect(
        await requestHeartbeat(connection.db, delivery, seed, 'nightly', {
            computerId: 'cmp_someoneelse00',
        })
    ).toBe(false);
    expect(await dreamRows(seed)).toEqual([]);
    expect(transport.framesOfType('start')).toHaveLength(0);
});

test('a busy Agent gets its dream queued, and it runs after the current work', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    const [human] = transport.framesOfType('start');

    expect(await dream(delivery, seed)).toBe(true);
    expect(await dreamRows(seed)).toEqual([{ chatId: null, state: 'queued' }]);
    // At most the unaccepted human run is resent; no dream starts beside it.
    expect(new Set(transport.framesOfType('start').map((frame) => frame.runId))).toEqual(
        new Set([human?.runId])
    );

    await delivery.onTurnSettled(seed.computerId, completed(seed, human?.runId ?? ''));
    const next = transport.framesOfType('start').at(-1);
    expect(next).toMatchObject({
        chatId: null,
        heartbeat: { id: `dream:${seed.agentId}:2026-10-11` },
    });
});

test('a queued dream takes its turn like any concrete item, ahead of waiting notices', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    expect(await dream(delivery, seed)).toBe(true);

    // Concrete work leads its own run, so the dream starts before the notice-lane message.
    const first = await wake();
    expect(first).toMatchObject({
        chatId: null,
        heartbeat: { id: `dream:${seed.agentId}:2026-10-11` },
    });

    await delivery.onTurnSettled(seed.computerId, completed(seed, first?.runId ?? ''));
    expect(transport.framesOfType('start').at(-1)).toMatchObject({ chatId: seed.dmChatId });
});

test('ambient rows a settled run already offered never block a dream', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.channelId });
    const start = await wake();
    // The Agent settles without pulling the channel message; it stays pending.
    await delivery.onTurnSettled(seed.computerId, completed(seed, start?.runId ?? ''));
    expect(await store.countQueuedInboxItems(connection.db, seed.agentId)).toBe(1);

    expect(await dream(delivery, seed)).toBe(true);
});
