import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { requestAgentDream } from '../src/agent-delivery/dream-request.ts';
import * as store from '../src/agent-delivery/store.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentRunTriggersTable } from '../src/postgres/schema.ts';
import { agentTurnTrigger } from '../src/server-agents/agent-turn-trigger.ts';
import { dreamRows as readDreamRows, requestDream, settledTurn } from './agent-dream-fixture.ts';
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
        dream: { id: `dream:${seed.agentId}:2026-10-11` },
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
    ).toEqual({ kind: 'dream' });

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

test('a stopped, busy, waiting, or foreign Agent is never woken to dream', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);

    await store.setStopped(connection.db, { ...seed, stopped: true });
    expect(await dream(delivery, seed)).toBe(false);
    await store.setStopped(connection.db, { ...seed, stopped: false });

    expect(
        await requestAgentDream(connection.db, delivery, {
            computerId: 'cmp_someoneelse00',
            request: {
                agentId: seed.agentId,
                localDate: '2026-10-11',
                type: 'agent-dream-request',
            },
            serverId: seed.serverId,
        })
    ).toBe(false);

    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    expect(transport.framesOfType('start')).toHaveLength(1);
    // Busy with that human run.
    expect(await dream(delivery, seed)).toBe(false);
    expect(await dreamRows(seed)).toEqual([]);
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
