import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as store from '../src/agent-delivery/store.ts';
import { readAgentHeartbeats } from '../src/heartbeat/heartbeat-lanes.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    agentDeliveryTable,
    agentHeartbeatChecksTable,
    channelParticipantsTable,
} from '../src/postgres/schema.ts';
import { requestDream, requestHeartbeat } from './agent-dream-fixture.ts';
import {
    fileReport,
    insertRun,
    makeActive,
    reportMeter,
    useRuntime,
} from './agent-heartbeat-lanes-fixture.ts';
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

const hour = 60 * 60 * 1000;
const now = Date.now();
const at = (hoursAgo: number) => new Date(now - hoursAgo * hour);

function read(seed: Seed, window: { from?: Date; to?: Date } = {}, userId = seed.userId) {
    return readAgentHeartbeats(
        connection.db,
        { clerkUserId: 'clerk', id: userId },
        {
            from: (window.from ?? at(24)).toISOString(),
            serverId: seed.serverId,
            to: (window.to ?? at(-1)).toISOString(),
        }
    );
}

async function lane(seed: Seed, window: { from?: Date; to?: Date } = {}) {
    const result = await read(seed, window);
    const [only] = result.lanes;
    return { marks: only?.marks ?? [], result, tokens: only?.tokens ?? 0 };
}

test('quiet, reported with a post, failed, and running runs read as their own marks', async () => {
    const seed = await seedAgent(connection.db);
    await connection.db
        .insert(channelParticipantsTable)
        .values({ chatId: seed.channelId, serverId: seed.serverId, userId: seed.userId });
    const quiet = await insertRun(connection.db, seed, {
        startedAt: at(6),
        status: 'completed',
        tokens: 100,
    });
    const reported = await insertRun(connection.db, seed, {
        startedAt: at(5),
        status: 'completed',
        tokens: 250,
    });
    await fileReport(connection.db, seed, reported, 'Pricing page changed.', {
        chatId: seed.channelId,
        postedAt: at(4.9),
    });
    const silent = await insertRun(connection.db, seed, {
        startedAt: at(4),
        status: 'completed',
        tokens: 50,
    });
    await fileReport(connection.db, seed, silent, 'Nothing new.', null);
    const failed = await insertRun(connection.db, seed, {
        startedAt: at(3),
        status: 'failed',
        tokens: 10,
    });
    const running = await insertRun(connection.db, seed, { startedAt: at(0.2) });
    await makeActive(connection.db, seed, running);

    const { marks, result, tokens } = await lane(seed);

    expect(marks.map((mark) => [mark.runId, mark.outcome])).toEqual([
        [quiet, 'quiet'],
        [reported, 'reported'],
        [silent, 'reported'],
        [failed, 'failed'],
        [running, 'running'],
    ]);
    expect(marks[1]).toMatchObject({
        durationMs: 60_000,
        report: { postedChatId: seed.channelId, text: 'Pricing page changed.' },
        tokens: 250,
    });
    expect(marks[2]?.report).toEqual({ postedChatId: null, text: 'Nothing new.' });
    expect(marks[4]).toMatchObject({ durationMs: null, tokens: null });
    expect(tokens).toBe(410);
    expect(result.summary).toMatchObject({ posts: 1, reported: 2, runs: 5, yielded: 0 });
});

test('a heartbeat stopped for addressed work reads as yielded', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    expect(await requestHeartbeat(connection.db, delivery, seed, 'daytime')).toBe(true);
    const heartbeat = transport.framesOfType('start').at(-1);
    await delivery.onAck({ agentId: seed.agentId, runId: heartbeat?.runId ?? '' });
    await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'dm',
        chatId: seed.dmChatId,
    });

    const { marks, result } = await lane(seed);

    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({
        kind: 'daytime',
        outcome: 'yielded',
        runId: heartbeat?.runId,
    });
    expect(result.summary).toMatchObject({ runs: 1, yielded: 1 });
});

test('skipped and paused slots come from recorded decisions', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery } = offlineDelivery(connection.db, seed);
    // A nightly with no activity since the last one is skipped.
    expect(await requestHeartbeat(connection.db, delivery, seed, 'nightly')).toBe(false);
    expect(await requestHeartbeat(connection.db, delivery, seed, 'nightly')).toBe(false);
    // A stopped Agent is skipped.
    await store.ensureDeliveryState(connection.db, {
        agentId: seed.agentId,
        serverId: seed.serverId,
    });
    await connection.db
        .update(agentDeliveryTable)
        .set({ stopped: true })
        .where(eq(agentDeliveryTable.agentId, seed.agentId));
    expect(await requestHeartbeat(connection.db, delivery, seed, 'daytime')).toBe(false);
    // A plan past the pause line pauses it.
    await connection.db
        .update(agentDeliveryTable)
        .set({ stopped: false })
        .where(eq(agentDeliveryTable.agentId, seed.agentId));
    await useRuntime(connection.db, seed, 'codex');
    await reportMeter(connection.db, seed, { resetsAt: null, runtime: 'codex', usedPercent: 85 });
    expect(
        await requestHeartbeat(connection.db, delivery, seed, 'daytime', { slot: '13:00' })
    ).toBe(false);

    const { marks, result } = await lane(seed);

    expect(marks.map((mark) => [mark.kind, mark.outcome, mark.skipReason, mark.runId])).toEqual([
        ['nightly', 'skipped', 'no-activity', null],
        ['daytime', 'skipped', 'stopped', null],
        ['daytime', 'paused', 'plan-limit', null],
    ]);
    expect(result.summary).toMatchObject({ paused: 1, runs: 0, skipped: 2 });
});

test('a queued slot records a check and no mark of its own', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery } = offlineDelivery(connection.db, seed);
    expect(await requestHeartbeat(connection.db, delivery, seed, 'daytime')).toBe(true);

    const checks = await connection.db
        .select({
            outcome: agentHeartbeatChecksTable.outcome,
            slot: agentHeartbeatChecksTable.slot,
        })
        .from(agentHeartbeatChecksTable)
        .where(eq(agentHeartbeatChecksTable.agentId, seed.agentId));
    expect(checks).toEqual([{ outcome: 'queued', slot: '08:00' }]);
    expect((await lane(seed)).marks).toEqual([]);
});

test('checks past retention are swept as new decisions arrive', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery } = offlineDelivery(connection.db, seed);
    await requestDream(connection.db, delivery, seed, '2026-09-01');
    await connection.db
        .update(agentHeartbeatChecksTable)
        .set({ createdAt: at(31 * 24) })
        .where(eq(agentHeartbeatChecksTable.agentId, seed.agentId));

    await requestHeartbeat(connection.db, delivery, seed, 'daytime', { localDate: '2026-10-12' });

    const rows = await connection.db
        .select({ localDate: agentHeartbeatChecksTable.localDate })
        .from(agentHeartbeatChecksTable)
        .where(eq(agentHeartbeatChecksTable.agentId, seed.agentId));
    expect(rows).toEqual([{ localDate: '2026-10-12' }]);
});
