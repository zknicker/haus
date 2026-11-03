import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { readAgentDispatchConfig } from '../src/agent-delivery/dispatch-config.ts';
import { requestSubagentWake } from '../src/agent-delivery/subagent-wake-request.ts';
import { ingestBackgroundWorkFrame } from '../src/computers/ingest-background-work.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentInboxTable, agentsTable } from '../src/postgres/schema.ts';
import { requestDream, requestHeartbeat, settledTurn } from './agent-dream-fixture.ts';
import { deliverHuman, offlineDelivery, type Seed, seedAgent } from './agent-inbox-harness.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

/**
 * A heartbeat or dream runs in a fresh session on the Agent's loopback proxy, so it never
 * starts while the main session holds background work: that work's self-started turn would
 * make `haus` calls as the heartbeat run (specs/heartbeat.md "Background work").
 */
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

function report(delivery: AgentDelivery, seed: Seed, subagents: number, tasks: number) {
    return ingestBackgroundWorkFrame(connection.db, delivery, {
        computerId: seed.computerId,
        connections: { send: () => true },
        frame: {
            agents: [{ agentId: seed.agentId, subagents, tasks }],
            type: 'agent-background-work',
        },
        serverId: seed.serverId,
    });
}

function rows(seed: Seed, source: string) {
    return connection.db
        .select({ state: agentInboxTable.state })
        .from(agentInboxTable)
        .where(and(eq(agentInboxTable.agentId, seed.agentId), eq(agentInboxTable.source, source)));
}

test('a daytime run is skipped as busy while the main session holds background work', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await report(delivery, seed, 1, 1);

    expect(await requestHeartbeat(connection.db, delivery, seed, 'daytime')).toBe(false);
    expect(await rows(seed, 'heartbeat')).toEqual([]);
    expect(transport.framesOfType('start')).toEqual([]);
});

test('a background shell alone also holds the daytime run', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await report(delivery, seed, 0, 1);

    expect(await requestHeartbeat(connection.db, delivery, seed, 'daytime')).toBe(false);
    const [stored] = await connection.db
        .select({ tasks: agentsTable.effectiveBackgroundTasks })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));
    expect(stored?.tasks).toBe(1);
});

test('a nightly run queues behind background work and starts once the work ends', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await report(delivery, seed, 2, 2);

    expect(await requestDream(connection.db, delivery, seed)).toBe(true);
    expect(await rows(seed, 'dream')).toEqual([{ state: 'queued' }]);
    expect(transport.framesOfType('start')).toEqual([]);

    // Other work is not held behind the deferred dream.
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    const [human] = transport.framesOfType('start');
    expect(human).toMatchObject({ chatId: seed.dmChatId });
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, human?.runId ?? ''));
    expect(transport.framesOfType('start')).toHaveLength(1);

    await report(delivery, seed, 0, 0);
    expect(transport.framesOfType('start').at(-1)).toMatchObject({
        chatId: null,
        heartbeat: { kind: 'nightly' },
    });
});

test('a sub-agent wake still runs while other background work is live', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await report(delivery, seed, 1, 1);
    const config = await readAgentDispatchConfig(connection.db, seed.agentId);

    const outcome = await requestSubagentWake(connection.db, delivery, {
        computerId: seed.computerId,
        request: {
            agentId: seed.agentId,
            reason: 'finished',
            sessionGeneration: config?.sessionGeneration ?? 1,
            type: 'agent-subagent-wake',
            wakeId: 'wake_000000000101',
        },
        serverId: seed.serverId,
    });
    expect(outcome).toBe('accepted');
    expect(transport.framesOfType('start').at(-1)).toMatchObject({
        subagentWake: { id: `subagent:${seed.agentId}:wake_000000000101` },
    });
});

test('a report without a task count, from an older Computer, counts its sub-agents', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery } = offlineDelivery(connection.db, seed);
    await ingestBackgroundWorkFrame(connection.db, delivery, {
        computerId: seed.computerId,
        connections: { send: () => true },
        frame: { agents: [{ agentId: seed.agentId, subagents: 3 }], type: 'agent-background-work' },
        serverId: seed.serverId,
    });
    const [stored] = await connection.db
        .select({ tasks: agentsTable.effectiveBackgroundTasks })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));
    expect(stored?.tasks).toBe(3);
});
