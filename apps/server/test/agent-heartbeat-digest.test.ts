import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { readHeartbeatSince } from '../src/agent-delivery/heartbeat-digest.ts';
import { heartbeatReportDedupeKey } from '../src/agent-delivery/heartbeat-keys.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentInboxTable,
    agentRunTriggersTable,
    chatMessagesTable,
} from '../src/postgres/schema.ts';
import { agentSpeaks, requestHeartbeat, settledTurn } from './agent-dream-fixture.ts';
import {
    addChannel,
    deliverHuman,
    offlineDelivery,
    type Seed,
    seedAgent,
} from './agent-inbox-harness.ts';
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

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

async function humanSays(seed: Seed, chatId: string, sequence: number, createdAt = new Date()) {
    await connection.db.insert(chatMessagesTable).values({
        authorUserId: seed.userId,
        chatId,
        content: 'hi',
        createdAt,
        id: createOpaqueId('msg'),
        nonce: createOpaqueId('nonce'),
        sequence,
        serverId: seed.serverId,
    });
}

test('the digest lists only conversations the Agent took part in, addressed and busiest first', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);

    // #product: a message from two days ago (outside the first-run day), then
    // three since, including the Agent's own, the human last.
    await humanSays(seed, seed.channelId, 5, hoursAgo(48));
    await humanSays(seed, seed.channelId, 6, hoursAgo(3));
    await agentSpeaks(connection.db, seed, seed.channelId, hoursAgo(2));
    await humanSays(seed, seed.channelId, 1_000_100, hoursAgo(1));
    // A channel the Agent never spoke or was named in stays out.
    const elsewhere = await addChannel(connection.db, seed, 'elsewhere');
    await humanSays(seed, elsewhere, 1, hoursAgo(1));
    // A DM that addresses the Agent leads, with fewer messages.
    await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'dm',
        chatId: seed.dmChatId,
    });
    // Nothing is running, so the queued DM starts its run; settle it so a heartbeat can follow.
    const dmRun = transport.framesOfType('start').at(-1);
    await delivery.onAck({ agentId: seed.agentId, runId: dmRun?.runId ?? '' });
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, dmRun?.runId ?? ''));

    expect(await requestHeartbeat(connection.db, delivery, seed, 'nightly')).toBe(true);
    const start = transport.framesOfType('start').at(-1);
    expect(start?.heartbeat?.since).toBeNull();
    expect(start?.heartbeat?.digest).toMatchObject({
        entries: [
            {
                addressed: true,
                afterSequence: 0,
                kind: 'dm',
                messageCount: 1,
                speakers: [`@${seed.humanHandle}`],
                target: `dm:@${seed.humanHandle}`,
                title: 'DM',
            },
            {
                addressed: false,
                afterSequence: 5,
                chatId: seed.channelId,
                kind: 'channel',
                lastSpeaker: `@${seed.humanHandle}`,
                messageCount: 3,
                target: '#product',
                title: '#product',
            },
        ],
        more: 0,
    });
    expect(start?.heartbeat?.digest.entries[1]?.speakers).toHaveLength(2);

    // A resend rebuilds the same frame, and the next daytime run continues from this one.
    await delivery.dispatchAgent(seed.agentId, seed.serverId, { resendActive: true });
    expect(transport.framesOfType('start').at(-1)).toEqual(start);
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, start?.runId ?? ''));
    const [trigger] = await connection.db
        .select({ at: agentRunTriggersTable.createdAt })
        .from(agentRunTriggersTable)
        .where(eq(agentRunTriggersTable.runId, start?.runId ?? ''));
    // The DM was only offered as a notice; once the Agent has read it, nothing waits.
    await connection.db
        .update(agentInboxTable)
        .set({ state: 'seen' })
        .where(eq(agentInboxTable.agentId, seed.agentId));
    expect(await requestHeartbeat(connection.db, delivery, seed, 'daytime')).toBe(true);
    const daytime = transport.framesOfType('start').at(-1);
    expect(daytime?.heartbeat?.since).toBe(trigger?.at.toISOString());
    expect(daytime?.heartbeat?.digest.entries).toEqual([]);
});

test('the digest caps at 20 entries and counts the rest', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    const busiest = await addChannel(connection.db, seed, 'busiest');
    for (let index = 0; index < 22; index += 1) {
        const chatId = await addChannel(connection.db, seed, `room-${index}`);
        await agentSpeaks(connection.db, seed, chatId, hoursAgo(2));
    }
    await agentSpeaks(connection.db, seed, busiest, hoursAgo(2));
    await humanSays(seed, busiest, 1, hoursAgo(1));
    await humanSays(seed, busiest, 2, hoursAgo(1));

    expect(await requestHeartbeat(connection.db, delivery, seed, 'nightly')).toBe(true);
    const digest = transport.framesOfType('start').at(-1)?.heartbeat?.digest;
    expect(digest?.entries).toHaveLength(20);
    expect(digest?.more).toBe(3);
    expect(digest?.entries[0]).toMatchObject({ messageCount: 3, target: '#busiest' });
});

test('the digest ranks before its candidate limit and counts every candidate in more', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    const busiest = await addChannel(connection.db, seed, 'busiest');
    for (let index = 0; index < 205; index += 1) {
        const chatId = await addChannel(connection.db, seed, `many-${index}`);
        await agentSpeaks(connection.db, seed, chatId, hoursAgo(2));
    }
    await agentSpeaks(connection.db, seed, busiest, hoursAgo(2));
    await humanSays(seed, busiest, 1, hoursAgo(1));
    await humanSays(seed, busiest, 2, hoursAgo(1));

    expect(await requestHeartbeat(connection.db, delivery, seed, 'nightly')).toBe(true);
    const digest = transport.framesOfType('start').at(-1)?.heartbeat?.digest;
    expect(digest?.entries[0]).toMatchObject({ messageCount: 3, target: '#busiest' });
    expect(digest?.more).toBe(206 - 20);
});

test('a heartbeat that did not complete does not move the next run cutoff', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await agentSpeaks(connection.db, seed, seed.channelId, hoursAgo(5));

    expect(await requestHeartbeat(connection.db, delivery, seed, 'nightly')).toBe(true);
    const interrupted = transport.framesOfType('start').at(-1);
    await delivery.onTurnSettled(seed.computerId, {
        ...settledTurn(seed, interrupted?.runId ?? ''),
        status: 'interrupted',
    });

    const since = (runId: string) =>
        readHeartbeatSince(connection.db, {
            agentId: seed.agentId,
            kind: 'nightly',
            runId,
            serverId: seed.serverId,
        });
    // The interrupted run completed nothing, so the next run still covers its window.
    expect(await since('run_next')).toBeNull();

    await delivery.dispatchAgent(seed.agentId, seed.serverId);
    const retry = transport.framesOfType('start').at(-1);
    await delivery.onAck({ agentId: seed.agentId, runId: retry?.runId ?? '' });
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, retry?.runId ?? ''));
    expect(await since('run_next')).toBeInstanceOf(Date);
});

test('a heartbeat report starts a chatless run carrying its text and the heartbeat run id', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: null,
        content: 'The Etsy listing went live.',
        dedupeKey: heartbeatReportDedupeKey('run_heartbeat1'),
        serverId: seed.serverId,
        source: 'heartbeat_report',
    });

    const start = transport.framesOfType('start').at(-1);
    expect(start).toMatchObject({
        chatId: null,
        drainItemIds: [],
        heartbeatReport: {
            heartbeatRunId: 'run_heartbeat1',
            id: 'heartbeat-report:run_heartbeat1',
            text: 'The Etsy listing went live.',
        },
        inbox: [],
        inboxDelivery: 'concrete',
    });
    expect(start?.heartbeat).toBeUndefined();
    const [trigger] = await connection.db
        .select({ chatId: agentRunTriggersTable.chatId, source: agentRunTriggersTable.source })
        .from(agentRunTriggersTable)
        .where(eq(agentRunTriggersTable.runId, start?.runId ?? ''));
    expect(trigger).toEqual({ chatId: null, source: 'heartbeat_report' });

    await delivery.dispatchAgent(seed.agentId, seed.serverId, { resendActive: true });
    expect(transport.framesOfType('start').at(-1)).toEqual(start);
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, start?.runId ?? ''));
    const [row] = await connection.db
        .select({ state: agentInboxTable.state })
        .from(agentInboxTable)
        .where(eq(agentInboxTable.dedupeKey, 'heartbeat-report:run_heartbeat1'));
    expect(row?.state).toBe('seen');
});
