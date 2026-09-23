import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { inspectAgentInbox } from '../src/agent-api/inbox.ts';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import type { ResolvedRunner } from '../src/computers/runner-credentials.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentInboxTable, messageTasksTable } from '../src/postgres/schema.ts';
import { deliverHuman, FakeTransport, type Seed, seedAgent } from './agent-inbox-harness.ts';
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

test('inbox check rows carry the facts the notice tags a target with', async () => {
    const seed = await seedAgent(connection.db);
    // Offline Computer: every enqueue plans nothing, so the rows stay queued.
    const delivery = new AgentDelivery(connection.db, new FakeTransport());
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    const taskMessageId = await deliverMention(delivery, seed);
    await connection.db.insert(messageTasksTable).values({
        chatId: seed.channelId,
        messageId: taskMessageId,
        number: 7,
        createdByUserId: seed.userId,
        origin: 'composed',
        serverId: seed.serverId,
    });
    const fireId = createOpaqueId('rmf');
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.channelId,
        content: `Reminder\nfire=${fireId}`,
        createdAt: new Date(Date.now() + 1000),
        dedupeKey: fireId,
        serverId: seed.serverId,
        source: 'reminder',
    });

    const inbox = await inspectAgentInbox(connection.db, runner(seed));

    expect(inbox.totalPending).toBe(3);
    expect(inbox.rows.find((row) => row.target === '#product')).toEqual({
        ask: null,
        chatId: seed.channelId,
        cloudAgentResult: false,
        dm: false,
        firstShortId: taskMessageId.slice(4, 12),
        latestSender: 'reminder',
        latestShortId: '-',
        mentioned: true,
        pendingCount: 2,
        target: '#product',
        taskNumber: null,
        thread: false,
    });
    expect(inbox.rows.find((row) => row.target.startsWith('dm:'))).toMatchObject({
        dm: true,
        latestSender: seed.humanHandle,
        mentioned: false,
        pendingCount: 1,
        taskNumber: null,
    });
});

test('the task number is the latest item task, as in the notice', async () => {
    const seed = await seedAgent(connection.db);
    const delivery = new AgentDelivery(connection.db, new FakeTransport());
    const messageId = await deliverMention(delivery, seed);
    await connection.db.insert(messageTasksTable).values({
        chatId: seed.channelId,
        messageId,
        number: 12,
        createdByUserId: seed.userId,
        origin: 'composed',
        serverId: seed.serverId,
    });

    const inbox = await inspectAgentInbox(connection.db, runner(seed));

    expect(inbox.rows).toEqual([
        expect.objectContaining({ mentioned: true, target: '#product', taskNumber: 12 }),
    ]);
});

test('inbox check advances nothing', async () => {
    const seed = await seedAgent(connection.db);
    const delivery = new AgentDelivery(connection.db, new FakeTransport());
    await deliverMention(delivery, seed);
    const before = await readInbox(seed);

    await inspectAgentInbox(connection.db, runner(seed));

    expect(await readInbox(seed)).toEqual(before);
    expect(before).toEqual([
        { noticeRunId: null, runId: null, servedAt: null, startNoticeRunId: null, state: 'queued' },
    ]);
});

async function deliverMention(delivery: AgentDelivery, seed: Seed): Promise<string> {
    const messageId = await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'mention',
        chatId: seed.channelId,
    });
    await connection.db
        .update(agentInboxTable)
        .set({ mentioned: true })
        .where(eq(agentInboxTable.dedupeKey, messageId));
    return messageId;
}

async function readInbox(seed: Seed) {
    return await connection.db
        .select({
            noticeRunId: agentInboxTable.noticeRunId,
            runId: agentInboxTable.runId,
            servedAt: agentInboxTable.servedAt,
            startNoticeRunId: agentInboxTable.startNoticeRunId,
            state: agentInboxTable.state,
        })
        .from(agentInboxTable)
        .where(eq(agentInboxTable.agentId, seed.agentId));
}

function runner(seed: Seed): ResolvedRunner {
    return {
        agentId: seed.agentId,
        capabilities: [],
        chatId: seed.channelId,
        computerId: seed.computerId,
        runId: 'run_inbox_check',
        runnerId: 'rnr_inbox_check',
        serverId: seed.serverId,
    };
}
