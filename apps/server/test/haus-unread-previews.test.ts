import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type NotificationFixture, startNotificationFixture } from './notification-fixture.ts';
import { startTestTask } from './task-place-fixture.ts';

let fixture: NotificationFixture;

beforeAll(async () => {
    fixture = await startNotificationFixture();
});

afterAll(async () => {
    await fixture.close();
});

/**
 * `chat.unreadPreviews` renders the waiting messages behind each unread Inbox
 * row: one preview per `chat.list` unread Chat and per unread followed Task,
 * holding the newest counted messages oldest first and counting the rest.
 */
test('chat.unreadPreviews previews exactly the unread Inbox rows with their counted messages', async () => {
    const { createChannel, harness, owner, peer, serverId } = fixture;
    const channelId = await createChannel('unread-previews');
    const peerSend = (content: string, nonce: string, replyToMessageId?: string) =>
        peer.trpc.chat.send.mutate({
            chatId: channelId,
            content,
            nonce,
            serverId,
            ...(replyToMessageId ? { replyToMessageId } : {}),
        });
    const previews = async () =>
        (await owner.trpc.chat.unreadPreviews.query({ serverId })).previews;

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
    const task = await startTestTask(harness, owner, {
        channelId,
        originMessageId: anchor.message.id,
        serverId,
        title: 'Ship Friday',
    });
    await owner.trpc.chat.send.mutate({
        chatId: task.chatId,
        content: 'Tracking the release here.',
        nonce: 'up-task-own',
        serverId,
    });
    const inTask = await peer.trpc.chat.send.mutate({
        chatId: task.chatId,
        content: 'Release notes are drafted.',
        nonce: 'up-task-peer',
        serverId,
    });

    const byChat = new Map((await previews()).map((preview) => [preview.chatId, preview]));
    expect(byChat.get(channelId)?.messages.map((message) => message.content)).toEqual([
        'Three.',
        'Four.',
        'Friday works.',
    ]);
    expect(byChat.get(channelId)?.messages.at(-1)?.reply).toMatchObject({
        parentMessageId: anchor.message.id,
    });
    expect(byChat.get(channelId)?.earlierUnreadCount).toBe(2);
    expect(byChat.get(channelId)?.task).toBeNull();
    expect(byChat.get(task.chatId)?.messages.map((message) => message.id)).toEqual([
        inTask.message.id,
    ]);
    expect(byChat.get(task.chatId)?.task).toMatchObject({
        originChatId: channelId,
        taskId: task.id,
        title: 'Ship Friday',
    });

    // The preview set is the Inbox's row set, and nothing else.
    const unreadChatIds = (await owner.trpc.chat.list.query({ serverId }))
        .filter((chat) => chat.unreadCount > 0)
        .map((chat) => chat.id);
    expect([...byChat.keys()].sort()).toEqual([...unreadChatIds, task.chatId].sort());

    const channel = (await owner.trpc.chat.list.query({ serverId })).find(
        (chat) => chat.id === channelId
    );
    await owner.trpc.chat.markRead.mutate({
        chatId: channelId,
        sequence: channel?.lastMessageSequence ?? 0,
        serverId,
    });
    const remaining = (await previews()).map((preview) => preview.chatId);
    expect(remaining).not.toContain(channelId);
    expect(remaining).toContain(task.chatId);
    expect(reply.message.chatId).toBe(channelId);
});
