import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { maxAgentChainTurns } from '../src/agent-delivery/chain-budget.ts';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { readAgentDispatchConfig } from '../src/agent-delivery/dispatch-config.ts';
import * as store from '../src/agent-delivery/store.ts';
import {
    requestSubagentWake,
    retireSubagentWake,
} from '../src/agent-delivery/subagent-wake-request.ts';
import { ingestBackgroundWorkFrame } from '../src/computers/ingest-background-work.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentInboxTable, agentRunTriggersTable, agentsTable } from '../src/postgres/schema.ts';
import { agentTurnTrigger } from '../src/server-agents/agent-turn-trigger.ts';
import { recordAgentBackgroundWork } from '../src/server-agents/record-agent-background-work.ts';
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

    expect(await wake(delivery, seed, 'wake_000000000001')).toBe('accepted');

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

    expect(await wake(delivery, seed, 'wake_000000000002')).toBe('accepted');
    // Covered by the queued wake: accepted, no second row.
    expect(await wake(delivery, seed, 'wake_000000000003')).toBe('accepted');
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
    ).toBe('refused');
    expect(
        await wake(delivery, seed, 'wake_000000000005', { computerId: 'cmp_someoneelse00' })
    ).toBe('refused');
    await store.setStopped(connection.db, { ...seed, stopped: true });
    expect(await wake(delivery, seed, 'wake_000000000006')).toBe('refused');
    expect(await wakeRows(seed)).toEqual([]);
    expect(transport.framesOfType('start')).toHaveLength(0);
});

test('Stop retires a queued wake and tells the Computer to end background work', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    expect(await wake(delivery, seed, 'wake_000000000007')).toBe('accepted');

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

test('a Computer’s sub-agent counts are stored for its own Agents and projected while online', async () => {
    const seed = await seedAgent(connection.db);
    const report = (computerId: string, subagents: number) =>
        recordAgentBackgroundWork(connection.db, computerId, {
            agents: [{ agentId: seed.agentId, subagents }],
            type: 'agent-background-work',
        });
    expect(await report(seed.computerId, 2)).toEqual([seed.agentId]);
    // An unchanged count announces nothing; another Computer's claim changes nothing.
    expect(await report(seed.computerId, 2)).toEqual([]);
    expect(await report('cmp_someoneelse00', 0)).toEqual([]);
    const [row] = await connection.db
        .select({ count: agentsTable.effectiveBackgroundSubagents })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));
    expect(row?.count).toBe(2);
    expect(await report(seed.computerId, 0)).toEqual([seed.agentId]);
});

test('at the automation chain ceiling a wake is refused unless reset work leads first', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    await store.ensureDeliveryState(connection.db, seed);
    await store.setAgentChainTurns(connection.db, {
        agentId: seed.agentId,
        turns: maxAgentChainTurns,
    });
    expect(await wake(delivery, seed, 'wake_000000000009')).toBe('refused');
    expect(await wakeRows(seed)).toEqual([]);

    // A human message queued ahead resets the chain, so the wake drains after it.
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    await store.setAgentChainTurns(connection.db, {
        agentId: seed.agentId,
        turns: maxAgentChainTurns,
    });
    transport.online.add(seed.computerId);
    expect(await wake(delivery, seed, 'wake_000000000010')).toBe('accepted');
});

test('a resent request is answered again without a second wake', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    expect(await wake(delivery, seed, 'wake_000000000011')).toBe('accepted');
    const [start] = transport.framesOfType('start');
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, start?.runId ?? ''));
    // The result was lost and the Computer resends after the wake already ran.
    expect(await wake(delivery, seed, 'wake_000000000011')).toBe('accepted');
    expect(await wakeRows(seed)).toEqual([{ chatId: null, state: 'seen' }]);
    expect(transport.framesOfType('start')).toHaveLength(1);
});

test('a run that adopted the self-started turn retires exactly that queued wake', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    const [human] = transport.framesOfType('start');
    expect(await wake(delivery, seed, 'wake_000000000012')).toBe('accepted');

    const retire = (wakeId: string, computerId = seed.computerId) =>
        retireSubagentWake(connection.db, {
            computerId,
            request: { agentId: seed.agentId, type: 'agent-subagent-wake-retire', wakeId },
            serverId: seed.serverId,
        });
    // Another wake id, or another Computer, retires nothing.
    await retire('wake_000000000099');
    await retire('wake_000000000012', 'cmp_someoneelse00');
    expect(await wakeRows(seed)).toEqual([{ chatId: null, state: 'queued' }]);
    await retire('wake_000000000012');
    expect(await wakeRows(seed)).toEqual([{ chatId: null, state: 'seen' }]);

    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, human?.runId ?? ''));
    expect(transport.framesOfType('start').filter((frame) => frame.subagentWake)).toEqual([]);
});

test('the Server answers each wake request on the Computer’s socket', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    const sent: unknown[] = [];
    const config = await readAgentDispatchConfig(connection.db, seed.agentId);
    const request = {
        agentId: seed.agentId,
        reason: 'finished',
        sessionGeneration: config?.sessionGeneration ?? 1,
        type: 'agent-subagent-wake',
        wakeId: 'wake_000000000013',
    };
    const ingest = (frame: unknown) =>
        ingestBackgroundWorkFrame(connection.db, delivery, {
            computerId: seed.computerId,
            connections: { send: (_computerId, command) => sent.push(command) > 0 },
            frame,
            serverId: seed.serverId,
        });
    expect(await ingest(request)).toBe(true);
    expect(await ingest({ ...request, sessionGeneration: 99, wakeId: 'wake_000000000014' })).toBe(
        true
    );
    expect(sent).toEqual([
        {
            agentId: seed.agentId,
            outcome: 'accepted',
            type: 'agent-subagent-wake-result',
            wakeId: 'wake_000000000013',
        },
        {
            agentId: seed.agentId,
            outcome: 'refused',
            type: 'agent-subagent-wake-result',
            wakeId: 'wake_000000000014',
        },
    ]);
});

test('a session reset retires a queued wake', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    expect(await wake(delivery, seed, 'wake_000000000008')).toBe('accepted');

    await delivery.reset({ agentId: seed.agentId, kind: 'session', serverId: seed.serverId });
    expect(await wakeRows(seed)).toEqual([{ chatId: null, state: 'seen' }]);
});
