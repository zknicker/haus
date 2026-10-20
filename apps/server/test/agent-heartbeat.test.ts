import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { UsageOverview } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { heartbeatReportDedupeKey } from '../src/agent-delivery/heartbeat-keys.ts';
import { heartbeatStaleMs } from '../src/agent-delivery/heartbeat-run.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentInboxTable, agentsTable, computersTable } from '../src/postgres/schema.ts';
import { agentSpeaks, requestHeartbeat, settledTurn } from './agent-dream-fixture.ts';
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

const inFuture = (ms: number) => new Date(Date.now() + ms);

function rows(seed: Seed, source: string) {
    return connection.db
        .select({ state: agentInboxTable.state })
        .from(agentInboxTable)
        .where(and(eq(agentInboxTable.agentId, seed.agentId), eq(agentInboxTable.source, source)));
}

test('a nightly run needs activity since the last one, and a report counts as activity', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);

    expect(await requestHeartbeat(connection.db, delivery, seed, 'nightly')).toBe(false);
    expect(await rows(seed, 'dream')).toEqual([]);

    await agentSpeaks(connection.db, seed);
    expect(await requestHeartbeat(connection.db, delivery, seed, 'nightly')).toBe(true);
    const first = transport.framesOfType('start').at(-1);
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, first?.runId ?? ''));

    // Quiet since that run: the next night is skipped.
    const next = { localDate: '2026-10-12' };
    expect(await requestHeartbeat(connection.db, delivery, seed, 'nightly', next)).toBe(false);

    // A heartbeat report the Agent sent since counts as taking part.
    await delivery.enqueue(connection.db, {
        agentId: seed.agentId,
        chatId: null,
        content: 'Found a thing.',
        createdAt: inFuture(5000),
        dedupeKey: heartbeatReportDedupeKey('run_earlier'),
        serverId: seed.serverId,
        source: 'heartbeat_report',
    });
    expect(await requestHeartbeat(connection.db, delivery, seed, 'nightly', next)).toBe(true);
});

test('a daytime run is skipped, never queued, while the Agent is busy or has concrete work', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);

    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    expect(await requestHeartbeat(connection.db, delivery, seed, 'daytime')).toBe(false);
    expect(await rows(seed, 'heartbeat')).toEqual([]);

    const busy = transport.framesOfType('start').at(-1);
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, busy?.runId ?? ''));
    expect(await requestHeartbeat(connection.db, delivery, seed, 'daytime')).toBe(true);
    expect(transport.framesOfType('start').at(-1)).toMatchObject({
        chatId: null,
        heartbeat: { id: `heartbeat:${seed.agentId}:2026-10-11:08:00`, kind: 'daytime' },
    });
});

test('concrete work already waiting skips a daytime run', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery } = offlineDelivery(connection.db, seed);
    await delivery.enqueue(connection.db, {
        agentId: seed.agentId,
        chatId: null,
        content: 'Found a thing.',
        dedupeKey: heartbeatReportDedupeKey('run_waiting'),
        serverId: seed.serverId,
        source: 'heartbeat_report',
    });
    expect(await requestHeartbeat(connection.db, delivery, seed, 'daytime')).toBe(false);
});

test('a daytime run that cannot start in half an hour is retired, never led', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    expect(await requestHeartbeat(connection.db, delivery, seed, 'daytime')).toBe(true);
    await connection.db
        .update(agentInboxTable)
        .set({ createdAt: new Date(Date.now() - heartbeatStaleMs - 60_000) })
        .where(
            and(eq(agentInboxTable.agentId, seed.agentId), eq(agentInboxTable.source, 'heartbeat'))
        );

    expect(await wake()).toBeUndefined();
    expect(transport.sent).toEqual([]);
    expect(await rows(seed, 'heartbeat')).toEqual([{ state: 'seen' }]);
});

function usageAt(codexWeekPercent: number): UsageOverview {
    return {
        codex: {
            provider: 'codex',
            snapshot: {
                capturedAt: new Date().toISOString(),
                creditsBalance: null,
                planType: 'pro',
                provider: 'codex',
                source: 'chatgpt-wham-usage',
                windows: [
                    {
                        id: 'current-week',
                        label: 'Weekly',
                        remainingPercent: 100 - codexWeekPercent,
                        resetAfterSeconds: null,
                        resetsAt: null,
                        usedPercent: codexWeekPercent,
                    },
                ],
            },
            status: 'ok',
        },
    } as unknown as UsageOverview;
}

test('the weekly usage meter at 80% pauses both kinds; below it, or unreported, does not', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await connection.db
        .update(agentsTable)
        .set({ desiredRuntimeId: 'codex' })
        .where(eq(agentsTable.id, seed.agentId));
    await agentSpeaks(connection.db, seed);
    const setUsage = (usage: UsageOverview | null) =>
        connection.db
            .update(computersTable)
            .set({ usageSnapshot: usage })
            .where(eq(computersTable.id, seed.computerId));

    await setUsage(usageAt(80));
    expect(await requestHeartbeat(connection.db, delivery, seed, 'nightly')).toBe(false);
    expect(await requestHeartbeat(connection.db, delivery, seed, 'daytime')).toBe(false);

    await setUsage(usageAt(79));
    expect(await requestHeartbeat(connection.db, delivery, seed, 'daytime')).toBe(true);
    const run = transport.framesOfType('start').at(-1);
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, run?.runId ?? ''));

    await setUsage(null);
    expect(await requestHeartbeat(connection.db, delivery, seed, 'nightly')).toBe(true);
});
