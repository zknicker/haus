import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { chatMessagesTable } from '../src/postgres/schema.ts';
import { messageCreatedTopic } from '../src/realtime/topics.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureTopic } from './realtime-capture.ts';
import { collectStream } from './realtime-stream.ts';

// Chat events are live notifications over focused topics: nothing replays, and
// each stream applies its own Chat access (specs/realtime-events.md).
let harness: HausServerHarness;
let connection: HausConnection;
let owner: HausClient;
let ownerUserId: string;
let chatId: string;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = await signIn('user_events_owner');
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Events Server',
        slug: 'events-server',
    });
    chatId = server.channels[0].id;
    serverId = server.id;
    ownerUserId = await readUserId('user_events_owner');
});

afterAll(async () => {
    owner.close();
    await connection.close();
    await harness.close();
});

test('a send publishes message.created with its notification facts, live only', async () => {
    const stream = collectStream(owner.trpc.chat.onMessageCreated, { serverId });
    await stream.started;
    const live = await send('live send', 'realtime-event-1');

    await expect(stream.next()).resolves.toEqual({
        authorUserId: ownerUserId,
        chatId,
        conversationKind: 'channel',
        mentionedUserIds: [],
        messageId: live.message.id,
        replyToAuthorUserId: null,
        sequence: live.message.sequence,
        serverId,
        taskId: null,
    });
    stream.stop();
});

test('an inline reply persists in its Chat and names the human it answers', async () => {
    const anchor = await send('reply event anchor', 'reply-event-anchor');
    const created = captureTopic(messageCreatedTopic);
    const second = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'reply event follow-up',
        nonce: 'reply-event-follow-up',
        replyToMessageId: anchor.message.id,
        serverId,
    });
    const [message] = await connection.db
        .select({
            chatId: chatMessagesTable.chatId,
            content: chatMessagesTable.content,
            nonce: chatMessagesTable.nonce,
            sequence: chatMessagesTable.sequence,
            sessionGeneration: chatMessagesTable.sessionGeneration,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, serverId),
                eq(chatMessagesTable.id, second.message.id)
            )
        );
    expect(message).toEqual({
        chatId,
        content: 'reply event follow-up',
        nonce: 'reply-event-follow-up',
        sequence: anchor.message.sequence + 1,
        // A human message belongs to no Agent session.
        sessionGeneration: null,
    });

    await expect(created.next()).resolves.toEqual({
        authorUserId: ownerUserId,
        chatId,
        conversationKind: 'channel',
        mentionedUserIds: [],
        messageId: second.message.id,
        replyToAuthorUserId: ownerUserId,
        sequence: anchor.message.sequence + 1,
        serverId,
        taskId: null,
    });
    created.stop();
});

test('event delivery skips an inaccessible Chat without terminating the stream', async () => {
    const peer = await signIn('user_events_filter_peer');
    await peer.trpc.server.create.mutate({
        displayName: 'Filter Peer Root',
        slug: 'events-filter-peer',
    });
    const peerUserId = await readUserId('user_events_filter_peer');
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_events_filter_peer', ${serverId}, ${peerUserId}, 'member')
    `;

    const stream = collectStream(peer.trpc.chat.onMessageCreated, { serverId });
    await stream.started;
    await send('not visible to peer', 'realtime-event-filtered');

    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${chatId}, ${peerUserId})
    `;
    const visible = await send('visible after joining', 'realtime-event-visible');

    // The first event delivered is the visible one: the hidden one was skipped
    // and the stream kept going.
    await expect(stream.next()).resolves.toMatchObject({ messageId: visible.message.id });
    expect(stream.events).toHaveLength(1);
    stream.stop();
    peer.close();
});

test('a revoked membership ends the stream with membership_lost on its next delivery', async () => {
    const peer = await signIn('user_events_peer');
    await peer.trpc.server.create.mutate({ displayName: 'Peer Root', slug: 'events-peer' });
    const peerUserId = await readUserId('user_events_peer');
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_events_peer', ${serverId}, ${peerUserId}, 'member')
    `;
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${chatId}, ${peerUserId})
    `;

    await peer.trpc.chat.send.mutate({
        chatId,
        content: 'history survives revocation',
        nonce: 'realtime-event-peer-history',
        serverId,
    });
    const stream = collectStream(peer.trpc.chat.onMessageCreated, { serverId });
    await stream.started;
    await harness.sql`
        update server_memberships set revoked_at = now()
        where server_id = ${serverId} and user_id = ${peerUserId}
    `;
    await send('membership was revoked', 'realtime-event-revoked');

    await expect(stream.ended()).resolves.toMatchObject({
        data: { code: 'FORBIDDEN', hausRefusal: 'membership_lost' },
    });
    expect(stream.events).toEqual([]);
    await expect(peer.trpc.server.list.query()).resolves.not.toContainEqual(
        expect.objectContaining({ id: serverId })
    );
    const history = await harness.sql`
        select content from chat_messages
        where server_id = ${serverId} and author_user_id = ${peerUserId}
    `;
    expect(history).toEqual([{ content: 'history survives revocation' }]);
    peer.close();
});

test('queries, mutations, and subscriptions reject a human from another Server', async () => {
    const outsider = await signIn('user_events_outsider');
    await outsider.trpc.server.create.mutate({
        displayName: 'Outsider Root',
        slug: 'events-outsider',
    });

    await expect(outsider.trpc.chat.search.query({ query: 'durable', serverId })).rejects.toThrow(
        /member/i
    );
    await expect(
        outsider.trpc.chat.send.mutate({
            chatId,
            content: 'cross-Server write',
            nonce: 'cross-server-write',
            serverId,
        })
    ).rejects.toThrow(/member/i);

    const stream = collectStream(outsider.trpc.chat.onMessageCreated, { serverId });
    await expect(stream.ended()).resolves.toMatchObject({
        data: { code: 'FORBIDDEN', hausRefusal: 'membership_lost' },
    });
    outsider.close();
});

function send(content: string, nonce: string) {
    return owner.trpc.chat.send.mutate({ chatId, content, nonce, serverId });
}

async function signIn(subject: string) {
    const token = await harness.humans.mintSessionToken(subject);
    return createHausClient(harness, token);
}

async function readUserId(subject: string) {
    const rows = (await harness.sql`
        select id from users where auth_subject = ${subject}
    `) as { id: string }[];
    return rows[0]?.id ?? '';
}
