import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentInboxConversationsResponseSchema } from '@haus/api';
import { eq, sql } from 'drizzle-orm';
import Fastify from 'fastify';
import {
    conversationsSql,
    listAgentInboxConversations,
} from '../src/agent-api/inbox-conversations.ts';
import {
    parseInboxConversationsQuery,
    registerAgentInboxConversationsRoute,
} from '../src/agent-api/inbox-conversations-route.ts';
import { mintRunnerCredential } from '../src/computers/runner-credentials.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    agentChannelMutesTable,
    channelAgentParticipantsTable,
    computersTable,
} from '../src/postgres/schema.ts';
import { addChannel } from './agent-inbox-harness.ts';
import {
    addPeerAgent,
    addThread,
    postMessage,
    readerRunner,
    seedReader,
    setReadPosition,
} from './agent-read-fixture.ts';
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

const unreadView = { before: null, limit: 20, view: 'unread' as const };

test('each joined conversation with someone else unread is one row, newest activity first', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    const peerId = await addPeerAgent(db, seed);
    const anchor = await postMessage(db, seed, { chatId: seed.channelId });
    const threadId = await addThread(db, seed, {
        anchorId: anchor.id,
        followed: true,
        parentChatId: seed.channelId,
    });
    await postMessage(db, seed, { chatId: seed.channelId, agentId: seed.agentId });
    await postMessage(db, seed, { chatId: threadId, agentId: peerId });
    await postMessage(db, seed, { chatId: seed.dmChatId });
    await postMessage(db, seed, { chatId: seed.dmChatId, agentId: seed.agentId });

    const inbox = await listAgentInboxConversations(db, readerRunner(seed), unreadView);

    expect(agentInboxConversationsResponseSchema.parse(inbox)).toEqual(inbox);
    expect(inbox.items.map(({ kind, target, unread }) => ({ kind, target, unread }))).toEqual([
        { kind: 'dm', target: `dm:@${seed.humanHandle}`, unread: 1 },
        { kind: 'thread', target: `#product:${anchor.id.slice(4, 12)}`, unread: 1 },
        // The Agent's own message is not unread.
        { kind: 'channel', target: '#product', unread: 1 },
    ]);
    expect(inbox.items[0]).toMatchObject({
        chatId: seed.dmChatId,
        lastReadSequence: 0,
        latestSenderHandle: expect.stringMatching(/^ada-/u),
        mentions: 0,
    });
    expect(inbox.totals).toEqual({ conversations: 3, dms: 1, mentions: 0 });
    expect(inbox).toMatchObject({ hasMore: false, nextBefore: null, view: 'unread' });
});

test('read positions, unfollowed Threads, and other channels stay out of the list', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    const anchor = await postMessage(db, seed, { chatId: seed.channelId });
    const unfollowed = await addThread(db, seed, {
        anchorId: anchor.id,
        followed: false,
        parentChatId: seed.channelId,
    });
    await postMessage(db, seed, { chatId: unfollowed });
    const otherChannel = await addChannel(db, seed, 'elsewhere');
    await postMessage(db, seed, { chatId: otherChannel });
    await setReadPosition(db, seed, seed.channelId, anchor.sequence);

    const inbox = await listAgentInboxConversations(db, readerRunner(seed), unreadView);

    expect(inbox.items).toEqual([]);
    expect(inbox.totals).toEqual({ conversations: 0, dms: 0, mentions: 0 });
});

test('a muted channel counts only mentions, and a mention pierces the mute', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    await db.insert(agentChannelMutesTable).values({
        agentId: seed.agentId,
        chatId: seed.channelId,
        serverId: seed.serverId,
    });
    await postMessage(db, seed, { chatId: seed.channelId });
    expect((await listAgentInboxConversations(db, readerRunner(seed), unreadView)).items).toEqual(
        []
    );

    await postMessage(db, seed, { chatId: seed.channelId, mentioned: true });
    await postMessage(db, seed, { chatId: seed.channelId });

    const inbox = await listAgentInboxConversations(db, readerRunner(seed), unreadView);
    expect(inbox.items).toEqual([
        expect.objectContaining({ mentions: 1, target: '#product', unread: 1 }),
    ]);
    expect(inbox.totals).toEqual({ conversations: 1, dms: 0, mentions: 1 });
    // The muted backlog is never counted, not merely hidden.
    const rows = (await db.execute(conversationsSql(readerRunner(seed)))) as Array<{
        muted: boolean;
        unread: number;
    }>;
    expect(rows).toEqual([expect.objectContaining({ muted: true, unread: 0 })]);
});

test('the mentions view keeps only mentioned rows while totals cover every row', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    await postMessage(db, seed, { chatId: seed.channelId, mentioned: true });
    const mentionedPast = await postMessage(db, seed, { chatId: seed.dmChatId, mentioned: true });
    await setReadPosition(db, seed, seed.dmChatId, mentionedPast.sequence);
    await postMessage(db, seed, { chatId: seed.dmChatId });

    const inbox = await listAgentInboxConversations(db, readerRunner(seed), {
        ...unreadView,
        view: 'mentions',
    });

    // A mention at or below the read position no longer counts.
    expect(inbox.items).toEqual([expect.objectContaining({ mentions: 1, target: '#product' })]);
    expect(inbox.totals).toEqual({ conversations: 2, dms: 1, mentions: 1 });
    expect(inbox.view).toBe('mentions');
});

test('keyset paging walks every row once with stable totals', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    const channels = [seed.channelId];
    for (const name of ['alpha', 'beta']) {
        const chatId = await addChannel(db, seed, name);
        await db.insert(channelAgentParticipantsTable).values({
            agentId: seed.agentId,
            chatId,
            serverId: seed.serverId,
        });
        channels.push(chatId);
    }
    for (const chatId of channels) {
        await postMessage(db, seed, { chatId });
    }

    const first = await listAgentInboxConversations(db, readerRunner(seed), {
        ...unreadView,
        limit: 2,
    });
    expect(first.items.map((item) => item.target)).toEqual(['#beta', '#alpha']);
    expect(first.hasMore).toBe(true);
    expect(first.nextBefore).toBe(first.items[1]?.activityKey ?? -1);

    const second = await listAgentInboxConversations(db, readerRunner(seed), {
        ...unreadView,
        before: first.nextBefore,
        limit: 2,
    });
    expect(second.items.map((item) => item.target)).toEqual(['#product']);
    expect(second).toMatchObject({ hasMore: false, nextBefore: null });
    expect(second.totals).toEqual(first.totals);
    expect(first.totals.conversations).toBe(3);
});

test('invalid arguments name the flag the way the CLI spells it', () => {
    expect(parseInboxConversationsQuery({ view: 'all' })).toBe(
        '--view must be one of unread, mentions; got all'
    );
    expect(parseInboxConversationsQuery({ before: '0' })).toBe(
        '--before must be a positive integer seq (copy it from the More: line); got 0'
    );
    expect(parseInboxConversationsQuery({ limit: '51' })).toBe(
        '--limit must be an integer from 1 to 50; got 51'
    );
    expect(parseInboxConversationsQuery({})).toEqual({ before: null, limit: 20, view: 'unread' });
});

test('a failed snapshot is a retryable 503, never a partial list', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    await postMessage(db, seed, { chatId: seed.channelId });
    const [computer] = await db
        .select({ credentialHash: computersTable.credentialHash })
        .from(computersTable)
        .where(eq(computersTable.id, seed.computerId));
    const { runnerToken } = await mintRunnerCredential(db, {
        agentId: seed.agentId,
        chatId: seed.channelId,
        credentialHash: computer?.credentialHash ?? '',
        runId: 'run_inbox_503',
    });
    const app = Fastify();
    registerAgentInboxConversationsRoute(app, { db });
    const get = async (url: string) =>
        await app.inject({
            headers: { authorization: `Bearer ${runnerToken}` },
            method: 'GET',
            url,
        });

    expect((await get('/api/agent/inbox/conversations')).json()).toMatchObject({
        items: [expect.objectContaining({ target: '#product' })],
    });
    expect((await get('/api/agent/inbox/conversations?view=all')).json()).toEqual({
        code: 'INVALID_ARG',
        message: '--view must be one of unread, mentions; got all',
    });

    await db.execute(sql`alter table agent_chat_reads rename to agent_chat_reads_broken`);
    try {
        const failed = await get('/api/agent/inbox/conversations');
        expect(failed.statusCode).toBe(503);
        expect(failed.json()).toEqual({
            code: 'INBOX_UNAVAILABLE',
            message: 'Inbox is temporarily unavailable',
            nextAction: 'Retry in a moment; to drain new messages now use haus message check.',
            retryable: true,
        });
    } finally {
        await db.execute(sql`alter table agent_chat_reads_broken rename to agent_chat_reads`);
        await app.close();
    }
});
