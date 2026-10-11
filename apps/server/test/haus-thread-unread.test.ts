import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type NotificationFixture, startNotificationFixture } from './notification-fixture.ts';

let fixture: NotificationFixture;

beforeAll(async () => {
    fixture = await startNotificationFixture();
});

afterAll(async () => {
    await fixture.close();
});

/**
 * A Thread is unread on its own (ADR 0043). A reply counts for the reader when
 * someone else wrote it past their Thread read marker and they follow the
 * Thread or the reply mentions them. `thread.listUnread`, the anchor preview's
 * "N new", and the badge all apply that one rule; the parent Channel never
 * carries Thread replies.
 */
test('thread.listUnread lists followed and mentioned Threads, never quiet, read, or deleted ones', async () => {
    const { createChannel, harness, owner, ownerUserId, peer, serverId } = fixture;
    const badge = async () => (await owner.trpc.chat.unreadChatCount.query()).count;
    const baseline = await badge();
    const channelId = await createChannel('thread-unread');
    const send = (content: string, nonce: string, anchorMessageId?: string) =>
        peer.trpc.chat.send.mutate({
            chatId: channelId,
            content,
            nonce,
            serverId,
            ...(anchorMessageId ? { thread: { anchorMessageId } } : {}),
        });

    // Followed: the reader wrote the anchor, so they follow its Thread.
    const followedAnchor = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Ship Friday?',
        nonce: 'tu-followed-anchor',
        serverId,
    });
    const followedReply = await send(
        'Friday works.',
        'tu-followed-reply',
        followedAnchor.message.id
    );
    const followedThreadId = followedReply.message.chatId;

    // Quiet: someone else's Thread the reader neither follows nor is named in.
    const quietAnchor = await send('Lunch?', 'tu-quiet-anchor');
    await send('Tacos.', 'tu-quiet-reply', quietAnchor.message.id);

    // Mentioned: only the reply naming the reader counts once they stop following.
    const mentionAnchor = await send('Who owns billing?', 'tu-mention-anchor');
    const mentionReply = await send(
        `[@Ada](user://${ownerUserId}) can you take it?`,
        'tu-mention-reply',
        mentionAnchor.message.id
    );
    const mentionThreadId = mentionReply.message.chatId;
    await harness.sql`
        update thread_follows set followed = false
        where thread_chat_id = ${mentionThreadId} and user_id = ${ownerUserId}
    `;
    await send('Or anyone, really.', 'tu-mention-quiet', mentionAnchor.message.id);

    // The Channel counts its own two messages from Bo, none of the four Thread replies.
    const channel = (await owner.trpc.chat.list.query({ serverId })).find(
        (chat) => chat.id === channelId
    );
    expect(channel?.unreadCount).toBe(2);

    const { threads } = await owner.trpc.thread.listUnread.query({ serverId });
    expect(threads).toEqual([
        {
            anchorMessageId: mentionAnchor.message.id,
            firstUnreadMessageId: mentionReply.message.id,
            firstUnreadSequence: 1,
            lastActivityAt: expect.any(String),
            lastMessageSequence: 2,
            // The preview is the counted reply, not the newer quiet follow-up.
            latestReply: {
                authorDisplayName: expect.any(String),
                content: mentionReply.message.content,
                createdAt: mentionReply.message.createdAt,
            },
            parentChatId: channelId,
            serverId,
            threadChatId: mentionThreadId,
            unreadCount: 1,
        },
        {
            anchorMessageId: followedAnchor.message.id,
            firstUnreadMessageId: followedReply.message.id,
            firstUnreadSequence: 1,
            lastActivityAt: expect.any(String),
            lastMessageSequence: 1,
            latestReply: {
                authorDisplayName: expect.any(String),
                content: 'Friday works.',
                createdAt: followedReply.message.createdAt,
            },
            parentChatId: channelId,
            serverId,
            threadChatId: followedThreadId,
            unreadCount: 1,
        },
    ]);

    // The anchor preview's "N new" applies the same rule.
    const { threads: summaries } = await owner.trpc.chat.messages.query({
        chatId: channelId,
        serverId,
    });
    const newOf = (anchorMessageId: string) =>
        summaries.find((summary) => summary.anchorMessageId === anchorMessageId)?.unreadCount;
    expect(newOf(followedAnchor.message.id)).toBe(1);
    expect(newOf(quietAnchor.message.id)).toBe(0);
    expect(newOf(mentionAnchor.message.id)).toBe(1);

    // The badge is unread Chats plus unread Threads.
    expect(await badge()).toBe(baseline + 1 + 2);

    // The Thread row's Mark read is chat.markRead on the Thread itself.
    await owner.trpc.chat.markRead.mutate({
        chatId: followedThreadId,
        sequence: followedReply.message.sequence,
        serverId,
    });
    expect(await unreadThreadIds()).toEqual([mentionThreadId]);

    // A deleted Thread leaves the list and the badge.
    await harness.sql`
        update chats set deleted_at = now(), deleted_by_user_id = ${ownerUserId}
        where id = ${mentionThreadId}
    `;
    expect(await unreadThreadIds()).toEqual([]);
    expect(await badge()).toBe(baseline + 1);
});

test("a Thread row previews the newest counted reply, never the viewer's own", async () => {
    const { createChannel, owner, peer, serverId } = fixture;
    const channelId = await createChannel('thread-unread-preview');
    const anchor = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Ship Friday?',
        nonce: 'tu-preview-anchor',
        serverId,
    });
    const reply = (author: typeof owner, content: string, nonce: string) =>
        author.trpc.chat.send.mutate({
            chatId: channelId,
            content,
            nonce,
            serverId,
            thread: { anchorMessageId: anchor.message.id },
        });
    await reply(peer, 'Friday works.', 'tu-preview-first');
    const counted = await reply(peer, 'Staging is green.', 'tu-preview-counted');
    await reply(owner, 'Great, shipping.', 'tu-preview-own');

    const { threads } = await owner.trpc.thread.listUnread.query({ serverId });
    const thread = threads.find((row) => row.anchorMessageId === anchor.message.id);
    expect(thread).toMatchObject({
        latestReply: {
            content: 'Staging is green.',
            createdAt: counted.message.createdAt,
        },
        lastMessageSequence: 3,
        unreadCount: 2,
    });
});

test("an Agent's first Thread reply on a human's Message follows that human", async () => {
    const { createChannel, mintRunner, orbitAgentId, owner, sendAgentMessage, serverId } = fixture;
    const channelId = await createChannel('agent-thread-reply');
    const anchor = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Can someone check the deploy?',
        nonce: 'tu-agent-anchor',
        serverId,
    });

    const orbit = await mintRunner(orbitAgentId, 'run_thread_unread_reply', channelId);
    const reply = await sendAgentMessage(
        orbit,
        `#agent-thread-reply:${anchor.message.id}`,
        'tu-agent-reply',
        'Deploy is green.'
    );

    const { threads } = await owner.trpc.thread.listUnread.query({ serverId });
    const thread = threads.find((row) => row.anchorMessageId === anchor.message.id);
    expect(thread).toMatchObject({
        firstUnreadMessageId: reply.messageId,
        parentChatId: channelId,
        unreadCount: 1,
    });
});

async function unreadThreadIds() {
    const { threads } = await fixture.owner.trpc.thread.listUnread.query({
        serverId: fixture.serverId,
    });
    return threads.map((thread) => thread.threadChatId);
}
