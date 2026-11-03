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
 * `chat.unreadPreviews` renders the waiting messages behind each unread Inbox
 * row: one preview per `chat.list` unread Chat and `thread.listUnread` Thread,
 * holding the newest counted messages oldest first and counting the rest.
 */
test('chat.unreadPreviews previews exactly the unread Inbox rows with their counted messages', async () => {
    const { createChannel, owner, peer, serverId } = fixture;
    const channelId = await createChannel('unread-previews');
    const peerSend = (content: string, nonce: string, anchorMessageId?: string) =>
        peer.trpc.chat.send.mutate({
            chatId: channelId,
            content,
            nonce,
            serverId,
            ...(anchorMessageId ? { thread: { anchorMessageId } } : {}),
        });
    const previews = async () =>
        (await owner.trpc.chat.unreadPreviews.query({ serverId })).previews;

    // The reader's own anchor: it never counts, and it makes them follow its Thread.
    const anchor = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Ship Friday?',
        nonce: 'up-anchor',
        serverId,
    });
    await peerSend('One.', 'up-1');
    await peerSend('Two.', 'up-2');
    await peerSend('Three.', 'up-3');
    await peerSend('Four.', 'up-4');
    const reply = await peerSend('Friday works.', 'up-reply', anchor.message.id);
    const threadChatId = reply.message.chatId;

    const byChat = new Map((await previews()).map((preview) => [preview.chatId, preview]));
    expect(byChat.get(channelId)?.messages.map((message) => message.content)).toEqual([
        'Two.',
        'Three.',
        'Four.',
    ]);
    expect(byChat.get(channelId)?.earlierUnreadCount).toBe(1);
    expect(byChat.get(threadChatId)?.messages.map((message) => message.id)).toEqual([
        reply.message.id,
    ]);
    expect(byChat.get(threadChatId)?.earlierUnreadCount).toBe(0);
    // A Thread's card names the message it hangs off; a Channel has none.
    expect(byChat.get(threadChatId)?.anchor?.id).toBe(anchor.message.id);
    expect(byChat.get(channelId)?.anchor).toBeNull();

    // The preview set is the Inbox's row set, and nothing else.
    const unreadChatIds = (await owner.trpc.chat.list.query({ serverId }))
        .filter((chat) => chat.unreadCount > 0)
        .map((chat) => chat.id);
    const { threads } = await owner.trpc.thread.listUnread.query({ serverId });
    expect([...byChat.keys()].sort()).toEqual(
        [...unreadChatIds, ...threads.map((thread) => thread.threadChatId)].sort()
    );

    // Mark read on the Channel row reads its Threads too; both previews leave.
    const channel = (await owner.trpc.chat.list.query({ serverId })).find(
        (chat) => chat.id === channelId
    );
    await owner.trpc.chat.markRead.mutate({
        chatId: channelId,
        includeThreads: true,
        sequence: channel?.lastMessageSequence ?? 0,
        serverId,
    });
    const remaining = (await previews()).map((preview) => preview.chatId);
    expect(remaining).not.toContain(channelId);
    expect(remaining).not.toContain(threadChatId);
});
