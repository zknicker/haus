import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { readAgentDispatchConfig } from '../src/agent-delivery/dispatch-config.ts';
import * as store from '../src/agent-delivery/store.ts';
import { requestSubagentWake } from '../src/agent-delivery/subagent-wake-request.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentInboxTable, agentRunTriggersTable } from '../src/postgres/schema.ts';
import { agentTurnTrigger } from '../src/server-agents/agent-turn-trigger.ts';
import { settledTurn } from './agent-dream-fixture.ts';
import { deliverHuman, offlineDelivery, type Seed, seedAgent } from './agent-inbox-harness.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

/** Sub-agent wakes (specs/runtime-drivers.md "Background work"), modeled on the dream run. */
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

async function wake(
    delivery: AgentDelivery,
    seed: Seed,
    wakeId: string,
    overrides: { computerId?: string; sessionGeneration?: number } = {}
) {
    const config = await readAgentDispatchConfig(connection.db, seed.agentId);
    return await requestSubagentWake(connection.db, delivery, {
        computerId: overrides.computerId ?? seed.computerId,
        request: {
            agentId: seed.agentId,
            reason: 'finished',
            sessionGeneration: overrides.sessionGeneration ?? config?.sessionGeneration ?? 1,
            type: 'agent-subagent-wake',
            wakeId,
        },
        serverId: seed.serverId,
    });
}

async function wakeRows(seed: Seed) {
    return await connection.db
        .select({ chatId: agentInboxTable.chatId, state: agentInboxTable.state })
        .from(agentInboxTable)
        .where(
            and(eq(agentInboxTable.agentId, seed.agentId), eq(agentInboxTable.source, 'subagent'))
        );
}

test('an idle Agent gets one chatless wake run, recorded with a sub-agent trigger', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);

    expect(await wake(delivery, seed, 'wake_000000000001')).toBe(true);

    const [start] = transport.framesOfType('start');
    expect(start).toMatchObject({
        chatId: null,
        drainItemIds: [],
        inbox: [],
        inboxDelivery: 'concrete',
        subagentWake: { id: `subagent:${seed.agentId}:wake_000000000001` },
    });
    expect(start).not.toHaveProperty('dream');
    const [trigger] = await connection.db
        .select()
        .from(agentRunTriggersTable)
        .where(eq(agentRunTriggersTable.runId, start?.runId ?? ''));
    expect(trigger).toMatchObject({ chatId: null, source: 'subagent' });
    expect(
        agentTurnTrigger({ chatId: null, source: 'subagent', visible: false, workId: 'w' })
    ).toEqual({ kind: 'subagent' });

    // A resend reproduces the same chatless frame.
    await delivery.dispatchAgent(seed.agentId, seed.serverId, { resendActive: true });
    expect(transport.framesOfType('start').at(-1)).toEqual(start);

    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, start?.runId ?? ''));
    expect(await wakeRows(seed)).toEqual([{ chatId: null, state: 'seen' }]);
});

test('several reports while the Agent is busy queue one wake, which runs after the current work', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    const [human] = transport.framesOfType('start');

    expect(await wake(delivery, seed, 'wake_000000000002')).toBe(true);
    expect(await wake(delivery, seed, 'wake_000000000003')).toBe(false);
    expect(await wakeRows(seed)).toEqual([{ chatId: null, state: 'queued' }]);

    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, human?.runId ?? ''));
    expect(transport.framesOfType('start').at(-1)).toMatchObject({
        chatId: null,
        subagentWake: { id: `subagent:${seed.agentId}:wake_000000000002` },
    });
});

test('a wake from another session generation, Computer, or for a stopped Agent is dropped', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    const generation =
        (await readAgentDispatchConfig(connection.db, seed.agentId))?.sessionGeneration ?? 1;

    // The work ran in a session a reset already replaced.
    expect(
        await wake(delivery, seed, 'wake_000000000004', { sessionGeneration: generation + 1 })
    ).toBe(false);
    expect(
        await wake(delivery, seed, 'wake_000000000005', { computerId: 'cmp_someoneelse00' })
    ).toBe(false);
    await store.setStopped(connection.db, { ...seed, stopped: true });
    expect(await wake(delivery, seed, 'wake_000000000006')).toBe(false);
    expect(await wakeRows(seed)).toEqual([]);
    expect(transport.framesOfType('start')).toHaveLength(0);
});

test('Stop retires a queued wake and tells the Computer to end background work', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    expect(await wake(delivery, seed, 'wake_000000000007')).toBe(true);

    await delivery.stop({ agentId: seed.agentId, serverId: seed.serverId });
    expect(await wakeRows(seed)).toEqual([{ chatId: null, state: 'seen' }]);
    expect(transport.framesOfType('stop')).toHaveLength(1);
    expect(transport.framesOfType('agent-stop-background')).toEqual([
        { agentId: seed.agentId, type: 'agent-stop-background' },
    ]);

    // An idle Stop still ends background work.
    await delivery.start({ agentId: seed.agentId, serverId: seed.serverId });
    await delivery.stop({ agentId: seed.agentId, serverId: seed.serverId });
    expect(transport.framesOfType('agent-stop-background')).toHaveLength(2);
});

test('a session reset retires a queued wake', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    expect(await wake(delivery, seed, 'wake_000000000008')).toBe(true);

    await delivery.reset({ agentId: seed.agentId, kind: 'session', serverId: seed.serverId });
    expect(await wakeRows(seed)).toEqual([{ chatId: null, state: 'seen' }]);
});
