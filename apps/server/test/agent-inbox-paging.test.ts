import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import Fastify from 'fastify';
import {
    decodeInboxActivityKey,
    encodeInboxActivityKey,
} from '../src/agent-api/inbox-activity-key.ts';
import {
    type InboxConversationsQuery,
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
    channelAgentParticipantsTable,
    chatMessagesTable,
    computersTable,
} from '../src/postgres/schema.ts';
import { addChannel, type Seed } from './agent-inbox-harness.ts';
import { postMessage, readerRunner, seedReader } from './agent-read-fixture.ts';
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

const at = (second: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, second));

test('a key round-trips its microsecond timestamp and id exactly', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    const message = await postMessage(db, seed, { chatId: seed.channelId });
    await db.execute(
        sql`update chat_messages set created_at = '2026-01-01T00:00:00.123456Z'::timestamptz
            where id = ${message.id}`
    );

    const [item] = (await page(seed, { before: null, limit: 20 })).items;

    expect(item).toBeDefined();
    expect(item?.activityKey).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(decodeInboxActivityKey(item?.activityKey ?? '')).toEqual({
        createdAt: '2026-01-01T00:00:00.123456Z',
        id: message.id,
    });
});

test('equal timestamps break ties by id across a page boundary', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    const ids = ['msg_tie_a', 'msg_tie_b', 'msg_tie_c'];
    const chats = await joinedChannels(seed, 3);
    for (const [index, chatId] of chats.entries()) {
        await postMessage(db, seed, { chatId, createdAt: at(10), id: ids[index] });
    }

    const first = await page(seed, { before: null, limit: 2 });
    const second = await page(seed, { before: decode(first.nextBefore), limit: 2 });

    expect(first.items.map((item) => item.chatId)).toEqual([chats[2], chats[1]]);
    expect(second.items.map((item) => item.chatId)).toEqual([chats[0]]);
    expect(second).toMatchObject({ hasMore: false, nextBefore: null });
});

test('continuation over stable data walks every conversation once', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    const chats = await joinedChannels(seed, 7);
    for (const [index, chatId] of chats.entries()) {
        // Pairs share a timestamp so ties straddle page boundaries too.
        await postMessage(db, seed, { chatId, createdAt: at(20 + Math.floor(index / 2)) });
    }

    const seen: string[] = [];
    let before: InboxConversationsQuery['before'] = null;
    let pages = 0;
    for (;;) {
        const result = await page(seed, { before, limit: 2 });
        seen.push(...result.items.map((item) => item.chatId));
        expect(result.totals.conversations).toBe(7);
        pages += 1;
        if (!result.hasMore) {
            break;
        }
        before = decode(result.nextBefore);
    }

    expect(pages).toBe(4);
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual([...chats].sort());
});

test('deleting a newest message between pages reorders that conversation without an error', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    const [moved, second, third] = await joinedChannels(seed, 3);
    await postMessage(db, seed, { chatId: moved ?? '', createdAt: at(1) });
    const newest = await postMessage(db, seed, { chatId: moved ?? '', createdAt: at(50) });
    await postMessage(db, seed, { chatId: second ?? '', createdAt: at(40) });
    await postMessage(db, seed, { chatId: third ?? '', createdAt: at(30) });
    // `#product` has nothing unread, so the list is exactly these three.

    const first = await page(seed, { before: null, limit: 2 });
    expect(first.items.map((item) => item.chatId)).toEqual([moved, second]);
    await db.delete(chatMessagesTable).where(eq(chatMessagesTable.id, newest.id));
    const next = await page(seed, { before: decode(first.nextBefore), limit: 2 });

    // Accepted: the stateless key cannot hide a conversation that moved below it.
    expect(next.items.map((item) => item.chatId)).toEqual([third, moved]);
});

test('malformed, non-base64url, and oversized keys are invalid arguments', () => {
    const valid = encodeInboxActivityKey({
        createdAt: '2026-01-01T00:00:00.000000Z',
        id: 'msg_one',
    });
    const malformed = [
        '',
        '0',
        'a+b/c=',
        `${valid}=`,
        'x'.repeat(201),
        Buffer.from('no separator').toString('base64url'),
        Buffer.from('2026-01-01\u0000msg_one').toString('base64url'),
        Buffer.from('2026-01-01T00:00:00.000000Z\u0000').toString('base64url'),
        Buffer.from('2026-01-01T00:00:00.000000Z\u0000a\u0000b').toString('base64url'),
    ];
    for (const before of malformed) {
        expect(decodeInboxActivityKey(before)).toBeNull();
        expect(parseInboxConversationsQuery({ before })).toBe(
            `--before must be the key printed on the More: line; got ${before.slice(0, 200)}`
        );
    }
    expect(parseInboxConversationsQuery({ before: valid })).toEqual({
        before: { createdAt: '2026-01-01T00:00:00.000000Z', id: 'msg_one' },
        limit: 20,
        view: 'unread',
    });
});

test('the route answers a bad key with a 400, never a 500 or an empty page', async () => {
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
        runId: 'run_inbox_400',
    });
    const app = Fastify();
    registerAgentInboxConversationsRoute(app, { db });
    try {
        for (const before of ['1190', 'x'.repeat(201), '%2B%2F']) {
            const response = await app.inject({
                headers: { authorization: `Bearer ${runnerToken}` },
                method: 'GET',
                url: `/api/agent/inbox/conversations?before=${before}`,
            });
            expect(response.statusCode).toBe(400);
            expect(response.json()).toMatchObject({ code: 'INVALID_ARG' });
        }
    } finally {
        await app.close();
    }
});

async function page(
    seed: Seed,
    query: Pick<InboxConversationsQuery, 'before' | 'limit'>
): ReturnType<typeof listAgentInboxConversations> {
    return await listAgentInboxConversations(connection.db, readerRunner(seed), {
        ...query,
        view: 'unread',
    });
}

function decode(key: string | null) {
    const position = decodeInboxActivityKey(key ?? '');
    if (!position) {
        throw new Error(`Expected a next key; got ${String(key)}`);
    }
    return position;
}

/** Channels the seeded Agent has joined, beyond `#product`. */
async function joinedChannels(seed: Seed, count: number): Promise<string[]> {
    const chats: string[] = [];
    for (let index = 0; index < count; index += 1) {
        const chatId = await addChannel(connection.db, seed, `paging-${index}`);
        await connection.db.insert(channelAgentParticipantsTable).values({
            agentId: seed.agentId,
            chatId,
            serverId: seed.serverId,
        });
        chats.push(chatId);
    }
    return chats;
}
