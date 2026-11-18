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

test('Mark read clears a Channel row with its inline replies and leaves its Task row', async () => {
    const { createChannel, harness, owner, ownerUserId, peer, serverId } = fixture;
    const channelId = await createChannel('mark-read-replies');
    const question = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Which region first?',
        nonce: 'mark-read-question',
        serverId,
    });
    await peer.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Top-level update.',
        nonce: 'mark-read-top',
        serverId,
    });
    await peer.trpc.chat.send.mutate({
        chatId: channelId,
        content: `[@Ada](user://${ownerUserId}) us-east, I think.`,
        nonce: 'mark-read-reply',
        replyToMessageId: question.message.id,
        serverId,
    });
    const task = await startTestTask(harness, owner, {
        channelId,
        originMessageId: question.message.id,
        serverId,
        title: 'Pick the first region',
    });
    await peer.trpc.chat.send.mutate({
        chatId: task.chatId,
        content: `[@Ada](user://${ownerUserId}) us-east is ready.`,
        nonce: 'mark-read-task',
        serverId,
    });
    const unreadOf = async (chatId: string) =>
        (await owner.trpc.chat.unreadPreviews.query({ serverId })).previews.find(
            (preview) => preview.chatId === chatId
        );

    const channel = (await owner.trpc.chat.list.query({ serverId })).find(
        (chat) => chat.id === channelId
    );
    expect(channel?.unreadCount).toBe(2);
    expect(await unreadOf(task.chatId)).toMatchObject({ task: { taskId: task.id } });

    await owner.trpc.chat.markRead.mutate({
        chatId: channelId,
        sequence: channel?.lastMessageSequence ?? 0,
        serverId,
    });
    expect(await unreadOf(channelId)).toBeUndefined();
    expect(await unreadOf(task.chatId)).toBeDefined();

    // A newer message makes the Channel unread again.
    await peer.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'One more thing.',
        nonce: 'mark-read-after',
        serverId,
    });
    expect(
        (await owner.trpc.chat.list.query({ serverId })).find((chat) => chat.id === channelId)
            ?.unreadCount
    ).toBe(1);
});
