import { afterAll, beforeAll, expect, test } from 'bun:test';
import { addThreadPeerToChannel } from './haus-chat-thread-peer.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { collectStream } from './realtime-stream.ts';

let harness: HausServerHarness;
let owner: HausClient;

beforeAll(async () => {
    harness = await startHausServerHarness();
    const token = await harness.humans.mintSessionToken('user_thread_owner');
    owner = createHausClient(harness, token);
});

afterAll(async () => {
    owner.close();
    await harness.close();
});

test('concurrent first replies converge on one deterministic child Thread', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Thread Server',
        slug: 'thread-server',
    });
    const parentChatId = server.channels[0].id;
    const anchor = await owner.trpc.chat.send.mutate({
        chatId: parentChatId,
        content: 'Anchor',
        nonce: 'thread-anchor',
        serverId: server.id,
    });

    const replies = await Promise.all(
        ['first', 'second'].map((content) =>
            owner.trpc.chat.send.mutate({
                chatId: parentChatId,
                content,
                nonce: `thread-${content}`,
                serverId: server.id,
                thread: { anchorMessageId: anchor.message.id },
            })
        )
    );

    const expectedThreadId = `cht_thr_${anchor.message.id.slice('msg_'.length)}`;
    expect(replies.map((reply) => reply.threadChatId)).toEqual([
        expectedThreadId,
        expectedThreadId,
    ]);
    expect(replies.map((reply) => reply.message.chatId)).toEqual([
        expectedThreadId,
        expectedThreadId,
    ]);
    expect(replies.map((reply) => reply.message.sequence).sort()).toEqual([1, 2]);

    await expect(
        owner.trpc.chat.messages.query({
            chatId: expectedThreadId,
            serverId: server.id,
        })
    ).resolves.toMatchObject({
        messages: [{ sequence: 1 }, { sequence: 2 }],
    });
    await expect(owner.trpc.chat.list.query({ serverId: server.id })).resolves.toHaveLength(1);
    await expect(
        owner.trpc.chat.search.query({ query: 'first', serverId: server.id })
    ).resolves.toEqual([]);
});

test('a direct mention restores an explicit Thread unfollow', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Thread Attention',
        slug: 'thread-attention',
    });
    const parentChatId = server.channels[0].id;
    const peer = await addThreadPeerToChannel(harness, server.id, parentChatId);
    const anchor = await owner.trpc.chat.send.mutate({
        chatId: parentChatId,
        content: 'Attention anchor',
        nonce: 'attention-anchor',
        serverId: server.id,
    });
    const firstReply = await peer.client.trpc.chat.send.mutate({
        chatId: parentChatId,
        content: 'Ordinary first reply',
        nonce: 'attention-first',
        serverId: server.id,
        thread: { anchorMessageId: anchor.message.id },
    });
    const threadChatId = firstReply.threadChatId as string;

    await expect(
        owner.trpc.chat.messages.query({ chatId: parentChatId, serverId: server.id })
    ).resolves.toMatchObject({
        threads: [
            {
                anchorMessageId: anchor.message.id,
                followed: true,
                replyCount: 1,
                threadChatId,
                unreadCount: 1,
            },
        ],
    });

    await harness.sql`
        update chats set last_message_sequence = 2
        where server_id = ${server.id} and id = ${threadChatId}
    `;
    const [{ id: peerUserId }] = (await harness.sql`
        select id from users where auth_subject = 'user_thread_peer'
    `) as { id: string }[];
    await harness.sql`
        insert into chat_messages (
            id, server_id, chat_id, author_user_id,
            content, nonce, sequence, created_at
        )
        values (
            'msg_peer_thread_attention', ${server.id}, ${threadChatId}, ${peerUserId},
            'A peer replied in this thread', 'peer-thread-attention', 2, now()
        )
    `;
    // Thread replies count on the Thread, never on the parent Channel.
    await expect(owner.trpc.chat.list.query({ serverId: server.id })).resolves.toMatchObject([
        { id: parentChatId, unreadCount: 0 },
    ]);
    expect(await unreadThreads(server.id)).toEqual([{ threadChatId, unreadCount: 2 }]);
    await expect(
        owner.trpc.chat.messages.query({ chatId: parentChatId, serverId: server.id })
    ).resolves.toMatchObject({
        threads: [{ followed: true, replyCount: 2, unreadCount: 2 }],
    });

    await owner.trpc.thread.setFollow.mutate({
        follow: false,
        serverId: server.id,
        threadChatId,
    });
    await peer.client.trpc.chat.send.mutate({
        chatId: parentChatId,
        content: 'Suppressed ordinary reply',
        nonce: 'attention-suppressed',
        serverId: server.id,
        thread: { anchorMessageId: anchor.message.id },
    });
    expect(await unreadThreads(server.id)).toEqual([]);
    await expect(
        owner.trpc.chat.messages.query({ chatId: parentChatId, serverId: server.id })
    ).resolves.toMatchObject({
        threads: [{ followed: false, replyCount: 3, unreadCount: 0 }],
    });

    await peer.client.trpc.chat.send.mutate({
        chatId: parentChatId,
        content: `Direct [@Owner](user://${peer.ownerUserId}) mention`,
        nonce: 'attention-pierce',
        serverId: server.id,
        thread: { anchorMessageId: anchor.message.id },
    });
    expect(await unreadThreads(server.id)).toEqual([{ threadChatId, unreadCount: 4 }]);
    await expect(
        owner.trpc.chat.messages.query({ chatId: parentChatId, serverId: server.id })
    ).resolves.toMatchObject({
        threads: [{ followed: true, replyCount: 4, unreadCount: 4 }],
    });

    await owner.trpc.chat.markRead.mutate({
        chatId: threadChatId,
        sequence: 4,
        serverId: server.id,
    });
    expect(await unreadThreads(server.id)).toEqual([]);

    await peer.client.trpc.chat.send.mutate({
        chatId: parentChatId,
        content: 'Ordinary attention restored',
        nonce: 'attention-refollow',
        serverId: server.id,
        thread: { anchorMessageId: anchor.message.id },
    });
    expect(await unreadThreads(server.id)).toEqual([{ threadChatId, unreadCount: 1 }]);

    await owner.trpc.thread.setFollow.mutate({
        follow: false,
        serverId: server.id,
        threadChatId,
    });
    await peer.client.trpc.chat.send.mutate({
        chatId: parentChatId,
        content: 'Suppressed again after a later explicit unfollow',
        nonce: 'attention-suppressed-again',
        serverId: server.id,
        thread: { anchorMessageId: anchor.message.id },
    });
    expect(await unreadThreads(server.id)).toEqual([]);

    peer.client.close();
});

test('Thread replies and follow changes announce their parent anchor', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Thread Events',
        slug: 'thread-events',
    });
    const parentChatId = server.channels[0].id;
    const anchor = await owner.trpc.chat.send.mutate({
        chatId: parentChatId,
        content: 'Event anchor',
        nonce: 'event-anchor',
        serverId: server.id,
    });
    const created = collectStream(owner.trpc.chat.onMessageCreated, { serverId: server.id });
    const follows = collectStream(owner.trpc.thread.onFollowUpdated, { serverId: server.id });
    await Promise.all([created.started, follows.started]);
    const reply = await owner.trpc.chat.send.mutate({
        chatId: parentChatId,
        content: 'Event reply',
        nonce: 'event-reply',
        serverId: server.id,
        thread: { anchorMessageId: anchor.message.id },
    });
    await owner.trpc.thread.setFollow.mutate({
        follow: false,
        serverId: server.id,
        threadChatId: reply.threadChatId as string,
    });

    // The stream opened after the anchor, so the first created event is the reply.
    await expect(created.next()).resolves.toMatchObject({
        chatId: reply.threadChatId,
        messageId: reply.message.id,
        parentChatId,
        threadAnchorMessageId: anchor.message.id,
    });
    await expect(follows.next()).resolves.toEqual({
        anchorMessageId: anchor.message.id,
        followed: false,
        parentChatId,
        serverId: server.id,
        threadChatId: reply.threadChatId,
    });
    created.stop();
    follows.stop();
});

/** The owner's Inbox Thread rows, narrowed to identity and count. */
async function unreadThreads(serverId: string) {
    const { threads } = await owner.trpc.thread.listUnread.query({ serverId });
    return threads.map(({ threadChatId, unreadCount }) => ({ threadChatId, unreadCount }));
}
