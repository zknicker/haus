import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentTurnSummary } from '@haus/api';
import { and, eq, ne } from 'drizzle-orm';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { readDeliveryState } from '../src/agent-delivery/store.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentDeliveryTable, agentInboxTable } from '../src/postgres/schema.ts';
import { FakeTransport, seedAgent } from './agent-inbox-harness.ts';
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

test('a human message queues behind an active backoff instead of cutting it short', async () => {
    const { delivery, seed, transport } = await onlineAgent();
    const retryAfter = new Date(Date.now() + 60_000);
    await connection.db.insert(agentDeliveryTable).values({
        agentId: seed.agentId,
        consecutiveFailures: 1,
        retryAfter,
        serverId: seed.serverId,
    });

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.dmChatId,
        content: 'are you there?',
        dedupeKey: 'msg-during-backoff',
        serverId: seed.serverId,
    });

    expect(transport.framesOfType('start')).toHaveLength(0);
    const state = await readDeliveryState(connection.db, seed.agentId);
    expect(state?.consecutiveFailures).toBe(1);
    expect(state?.retryAfter?.getTime()).toBe(retryAfter.getTime());
    expect(await countUnsettledPending(seed.agentId)).toBe(1);
});

test('repeated rate limits keep backing off and redriving without pausing', async () => {
    const { delivery, seed, transport } = await onlineAgent();
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.dmChatId,
        content: 'wait out the limit',
        dedupeKey: 'msg-rate-limit',
        serverId: seed.serverId,
        source: 'onboarding',
    });

    const delays: number[] = [];
    for (let attempt = 1; attempt <= 6; attempt += 1) {
        const runId = transport.framesOfType('start')[attempt - 1]?.runId ?? '';
        await delivery.onAck({ agentId: seed.agentId, runId });
        const settledAt = Date.now();
        await delivery.onTurnSettled(
            seed.computerId,
            failedTurn(seed.agentId, runId, 'rate-limit')
        );
        const state = await readDeliveryState(connection.db, seed.agentId);
        expect(state?.consecutiveFailures).toBe(0);
        delays.push((state?.retryAfter?.getTime() ?? 0) - settledAt);
        await connection.db
            .update(agentDeliveryTable)
            .set({ retryAfter: new Date(Date.now() - 1) })
            .where(eq(agentDeliveryTable.agentId, seed.agentId));
        await delivery.sweep();
        expect(transport.framesOfType('start')).toHaveLength(attempt + 1);
    }
    // Exponential from 10s, jittered by at most 10%, capped at five minutes.
    expect(delays[0]).toBeGreaterThanOrEqual(10_000);
    expect(delays[0]).toBeLessThan(12_000);
    expect(delays[4]).toBeGreaterThanOrEqual(160_000);
    expect(delays[5]).toBeGreaterThanOrEqual(300_000);
    expect(delays[5]).toBeLessThan(302_000);
});

test('a failed turn that produced output counts without requeueing its work', async () => {
    const { delivery, seed, transport } = await onlineAgent();
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.dmChatId,
        content: 'do a thing',
        dedupeKey: 'msg-progress',
        serverId: seed.serverId,
        source: 'onboarding',
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    await delivery.onTurnSettled(seed.computerId, failedTurn(seed.agentId, runId, 'unknown', true));

    const state = await readDeliveryState(connection.db, seed.agentId);
    expect(state?.consecutiveFailures).toBe(1);
    expect(state?.retryAfter?.getTime()).toBeGreaterThan(Date.now());
    expect(await countUnsettledPending(seed.agentId)).toBe(0);
});

async function onlineAgent() {
    const seed = await seedAgent(connection.db);
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    return { delivery: new AgentDelivery(connection.db, transport), seed, transport };
}

async function countUnsettledPending(agentId: string): Promise<number> {
    const rows = await connection.db
        .select({ id: agentInboxTable.id })
        .from(agentInboxTable)
        .where(and(eq(agentInboxTable.agentId, agentId), ne(agentInboxTable.state, 'seen')));
    return rows.length;
}

function failedTurn(
    agentId: string,
    runId: string,
    failureKind: NonNullable<AgentTurnSummary['failureKind']>,
    outputProduced = false
): AgentTurnSummary {
    const at = new Date().toISOString();
    return {
        activity: { operations: [] },
        agentId,
        endedAt: at,
        failureKind,
        messageCount: outputProduced ? 1 : 0,
        modelId: 'gpt-test',
        outputProduced,
        runId,
        runtimeId: 'codex',
        startedAt: at,
        status: 'failed',
        summary: 'failed',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}
