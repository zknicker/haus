import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { eq, sql } from 'drizzle-orm';
import { followAgentThread } from '../src/agent-api/attention.ts';
import { readAgentHistory } from '../src/agent-api/message-history.ts';
import { recordExactMessagesServed } from '../src/agent-delivery/cursors.ts';
import { planAgentMessageRecipients } from '../src/agent-delivery/message-recipients.ts';
import { joinChannelAgents } from '../src/chats/channel-agent-membership.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentChatReadsTable, agentsTable } from '../src/postgres/schema.ts';
import {
    addPeerAgent,
    addThread,
    postMessage,
    readerRunner,
    readPosition,
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

test('the migration backfill starts every current membership read through its last message', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    const anchor = await postMessage(db, seed, { chatId: seed.channelId });
    await postMessage(db, seed, { chatId: seed.channelId });
    const followed = await addThread(db, seed, {
        anchorId: anchor.id,
        followed: true,
        parentChatId: seed.channelId,
    });
    await postMessage(db, seed, { chatId: followed });
    const unfollowedAnchor = await postMessage(db, seed, { chatId: seed.channelId });
    const unfollowed = await addThread(db, seed, {
        anchorId: unfollowedAnchor.id,
        followed: false,
        parentChatId: seed.channelId,
    });
    await postMessage(db, seed, { chatId: seed.dmChatId });
    await db.delete(agentChatReadsTable).where(eq(agentChatReadsTable.agentId, seed.agentId));

    await db.execute(sql.raw(await migrationBackfill()));

    expect(await readPosition(db, seed, seed.channelId)).toBe(3);
    expect(await readPosition(db, seed, followed)).toBe(1);
    expect(await readPosition(db, seed, seed.dmChatId)).toBe(1);
    expect(await readPosition(db, seed, unfollowed)).toBeNull();
});

test('joining starts read at the present; a mention that follows the Agent in stays unread', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    const peerId = await addPeerAgent(db, seed);
    const anchor = await postMessage(db, seed, { chatId: seed.channelId });
    await postMessage(db, seed, { chatId: seed.channelId });
    await joinChannelAgents(db, {
        agentIds: [peerId],
        chatId: seed.channelId,
        serverId: seed.serverId,
    });
    const [peer] = await db
        .select({ sequence: agentChatReadsTable.sequence })
        .from(agentChatReadsTable)
        .where(eq(agentChatReadsTable.agentId, peerId));
    expect(peer?.sequence).toBe(2);

    const threadId = await addThread(db, seed, {
        anchorId: anchor.id,
        followed: false,
        parentChatId: seed.channelId,
    });
    await postMessage(db, seed, { chatId: threadId });
    const [agent] = await db
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));
    const content = `@${agent?.handle} can you look?`;
    const mention = await postMessage(db, seed, { chatId: threadId, content });
    await planAgentMessageRecipients(db, {
        authorAgentId: null,
        chatId: threadId,
        content,
        messageId: mention.id,
        serverId: seed.serverId,
    });
    expect(await readPosition(db, seed, threadId)).toBe(mention.sequence - 1);

    // Following an already-followed Thread keeps what is unread there.
    await followAgentThread(db, {
        agentId: seed.agentId,
        serverId: seed.serverId,
        threadChatId: threadId,
    });
    expect(await readPosition(db, seed, threadId)).toBe(mention.sequence - 1);
});

test('read --unread starts after the read position and moves it through the page', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    for (let index = 0; index < 5; index += 1) {
        await postMessage(db, seed, { chatId: seed.channelId });
    }
    await setReadPosition(db, seed, seed.channelId, 2);
    const runner = readerRunner(seed);
    const read = (limit: number) =>
        readAgentHistory(db, runner, { limit, target: '#product', unread: true });

    const first = await read(2);
    expect(first.messages.map((message) => message.sequence)).toEqual([3, 4]);
    expect(first).toMatchObject({
        has_newer: true,
        // `last_read` is the position before this read moved it (Raft parity).
        last_read: { after: 2, unread_after: 2 },
        read_through_seq: 4,
        unread_after_seq: 2,
    });

    const second = await read(10);
    expect(second.messages.map((message) => message.sequence)).toEqual([5]);
    expect(second).toMatchObject({
        has_newer: false,
        last_read: { after: 4, unread_after: 4 },
        read_through_seq: 5,
        unread_after_seq: 4,
    });

    const drained = await read(10);
    expect(drained.messages).toEqual([]);
    expect(drained).toMatchObject({ read_through_seq: 5, unread_after_seq: 5 });
});

test('a plain read moves the read position only when it continues from it', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    for (let index = 0; index < 6; index += 1) {
        await postMessage(db, seed, { chatId: seed.channelId });
    }
    await setReadPosition(db, seed, seed.channelId, 2);
    const runner = readerRunner(seed);

    const browsed = await readAgentHistory(db, runner, {
        after: '4',
        limit: 10,
        target: '#product',
    });
    expect(browsed.messages.map((message) => message.sequence)).toEqual([5, 6]);
    expect(await readPosition(db, seed, seed.channelId)).toBe(2);
    expect(browsed.last_read).toEqual({ after: 2, unread_after: 2 });

    await readAgentHistory(db, runner, { after: '2', limit: 2, target: '#product' });
    expect(await readPosition(db, seed, seed.channelId)).toBe(4);

    const latest = await readAgentHistory(db, runner, { limit: 10, target: '#product' });
    expect(await readPosition(db, seed, seed.channelId)).toBe(6);
    expect(latest.last_read).toEqual({ after: 4, unread_after: 4 });
});

test('delivery-seen moves the read position through the contiguous visible prefix', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    const one = await postMessage(db, seed, { chatId: seed.channelId });
    const two = await postMessage(db, seed, { chatId: seed.channelId });
    await postMessage(db, seed, { agentId: seed.agentId, chatId: seed.channelId });
    const four = await postMessage(db, seed, { chatId: seed.channelId });
    const serve = async (messages: Array<{ id: string }>) =>
        await recordExactMessagesServed(db, {
            agentId: seed.agentId,
            messages: messages.map(({ id }) => ({ chatId: seed.channelId, id })),
            runId: 'run_seen',
            serverId: seed.serverId,
        });

    await serve([one, four]);
    // Message 2 is still unseen, so the position stops before it.
    expect(await readPosition(db, seed, seed.channelId)).toBe(1);

    await serve([two]);
    // The Agent's own message 3 needs no visibility.
    expect(await readPosition(db, seed, seed.channelId)).toBe(4);
});

/** The data statement the migration appends after its DDL. */
async function migrationBackfill() {
    const migration = await readFile(
        new URL('../drizzle/postgres/0062_agent_chat_reads.sql', import.meta.url),
        'utf8'
    );
    const statement = migration
        .split('--> statement-breakpoint')
        .find((part) => part.includes('INSERT INTO "agent_chat_reads"'));
    if (!statement) {
        throw new Error('The agent_chat_reads migration has no backfill.');
    }
    return statement;
}
