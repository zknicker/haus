import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentTurnSummary, ServerUpdatedEvent } from '@haus/api';
import { eq } from 'drizzle-orm';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { readDeliveryState } from '../src/agent-delivery/store.ts';
import { subscribeToServerUpdates } from '../src/haus-api/server-events.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentDeliveryTable } from '../src/postgres/schema.ts';
import { FakeTransport, seedAgent } from './agent-inbox-harness.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

let cluster: PostgresCluster;
let connection: HausConnection;

const hourMs = 60 * 60_000;
const fingerprint = '0123456789abcdef';

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

test('the same failure three times pauses; the sweep skips it until a human lifts it', async () => {
    const { delivery, seed, transport } = await onlineAgent();
    await delivery.deliver(work(seed, 'summarize the thread', 'onboarding'));
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        await failLatestRun(delivery, transport, seed, attempt);
        if (attempt < 3) {
            await expireRetryAfter(seed.agentId);
            await delivery.sweep();
        }
    }
    const paused = await readDeliveryState(connection.db, seed.agentId);
    expect(paused).toMatchObject({
        consecutiveFailures: 3,
        failureFingerprint: fingerprint,
        lastFailureCode: 'compaction-failed',
        lastFailureKind: 'unknown',
        pauseStep: 0,
        sameFailureStreak: 3,
    });
    expect(paused?.pausedAt).not.toBeNull();
    expect(paused?.retryAfter?.getTime()).toBeGreaterThan(Date.now() + hourMs - 60_000);

    // Paused: neither the sweep nor more automated work wakes it.
    await delivery.sweep();
    await delivery.deliver(work(seed, 'another reminder', 'reminder'));
    expect(transport.framesOfType('start')).toHaveLength(3);

    // The probe is due: exactly one run, however often the sweep fires.
    await expireRetryAfter(seed.agentId);
    await delivery.sweep();
    const probeRunId = transport.framesOfType('start').at(-1)?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId: probeRunId });
    await delivery.sweep();
    expect(transport.framesOfType('start')).toHaveLength(4);
    await failLatestRun(delivery, transport, seed, 4);
    const probed = await readDeliveryState(connection.db, seed.agentId);
    expect(probed?.pauseStep).toBe(1);
    expect(probed?.retryAfter?.getTime()).toBeGreaterThan(Date.now() + 4 * hourMs - 60_000);

    // A human message lifts the pause at once and announces it after commit.
    const updates = watchServerUpdates();
    await delivery.deliver(work(seed, 'try again', 'human'));
    expect(transport.framesOfType('start')).toHaveLength(5);
    expect(await readDeliveryState(connection.db, seed.agentId)).toMatchObject({
        consecutiveFailures: 0,
        failureFingerprint: null,
        pausedAt: null,
        pauseStep: null,
        retryAfter: null,
        sameFailureStreak: 0,
    });
    expect(await updates.stop()).toContainEqual(
        expect.objectContaining({ agentId: seed.agentId, scope: 'agent' })
    );
});

test('agent and automation work never lift a wake pause', async () => {
    const { delivery, seed, transport } = await pausedAgent();
    for (const source of ['agent:wren', 'reminder', 'trigger', 'task_assignment'] as const) {
        await delivery.deliver(work(seed, `from ${source}`, source));
    }
    expect(transport.framesOfType('start')).toHaveLength(0);
    expect((await readDeliveryState(connection.db, seed.agentId))?.pausedAt).not.toBeNull();
});

test('Restart lifts a wake pause and redrives queued work', async () => {
    const { delivery, seed, transport } = await pausedAgent();
    await delivery.deliver(work(seed, 'retry after repair', 'reminder'));
    expect(transport.framesOfType('start')).toHaveLength(0);

    await delivery.restart({ agentId: seed.agentId, serverId: seed.serverId });

    expect(transport.framesOfType('start')).toHaveLength(1);
    expect((await readDeliveryState(connection.db, seed.agentId))?.pausedAt).toBeNull();
});

test('a session reset lifts a wake pause', async () => {
    const { delivery, seed } = await pausedAgent();
    await delivery.reset({ agentId: seed.agentId, kind: 'session', serverId: seed.serverId });
    const state = await readDeliveryState(connection.db, seed.agentId);
    expect(state?.pausedAt).toBeNull();
    expect(state?.retryAfter).toBeNull();
});

async function onlineAgent() {
    const seed = await seedAgent(connection.db);
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    return { delivery: new AgentDelivery(connection.db, transport), seed, transport };
}

async function pausedAgent() {
    const agent = await onlineAgent();
    const now = new Date();
    await connection.db.insert(agentDeliveryTable).values({
        agentId: agent.seed.agentId,
        consecutiveFailures: 3,
        lastFailureAt: now,
        lastFailureCode: 'compaction-failed',
        lastFailureKind: 'unknown',
        pausedAt: now,
        pauseStep: 0,
        retryAfter: new Date(now.getTime() + hourMs),
        serverId: agent.seed.serverId,
    });
    return agent;
}

function work(
    seed: { agentId: string; dmChatId: string; serverId: string },
    content: string,
    source: string
) {
    const dedupeKey = `wake-${content.replaceAll(' ', '-')}`;
    return {
        agentId: seed.agentId,
        chatId: seed.dmChatId,
        content,
        dedupeKey,
        serverId: seed.serverId,
        source,
    };
}

async function failLatestRun(
    delivery: AgentDelivery,
    transport: FakeTransport,
    seed: { agentId: string; computerId: string },
    attempt: number
) {
    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(attempt);
    const runId = starts.at(-1)?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    const at = new Date().toISOString();
    await delivery.onTurnSettled(seed.computerId, {
        activity: { operations: [] },
        agentId: seed.agentId,
        endedAt: at,
        failureCode: 'compaction-failed',
        failureFingerprint: fingerprint,
        failureKind: 'unknown',
        messageCount: 0,
        modelId: 'gpt-test',
        outputProduced: false,
        runId,
        runtimeId: 'codex',
        startedAt: at,
        status: 'failed',
        summary: 'failed',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    } satisfies AgentTurnSummary);
}

async function expireRetryAfter(agentId: string) {
    await connection.db
        .update(agentDeliveryTable)
        .set({ retryAfter: new Date(Date.now() - 1) })
        .where(eq(agentDeliveryTable.agentId, agentId));
}

function watchServerUpdates() {
    const controller = new AbortController();
    const events: ServerUpdatedEvent[] = [];
    const listening = (async () => {
        try {
            for await (const event of subscribeToServerUpdates(controller.signal)) {
                events.push(event);
            }
        } catch {
            // Aborting the subscription ends the watch.
        }
    })();
    return {
        stop: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            controller.abort();
            await listening;
            return events;
        },
    };
}
