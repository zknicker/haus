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
 * The Inbox's Mark read reuses `chat.markRead`. Viewing a Channel reads only
 * its own messages; Mark read with `includeThreads` also clears the Thread
 * replies its unread count rolls up, so the Unread row actually leaves.
 */
test('Mark read with includeThreads clears a Channel and the Thread replies it rolls up', async () => {
    const { createChannel, owner, ownerUserId, peer, serverId } = fixture;
    const channelId = await createChannel('mark-read-threads');
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
        nonce: 'mark-read-thread',
        serverId,
        thread: { anchorMessageId: question.message.id },
    });
    const unreadOf = async () =>
        (await owner.trpc.chat.list.query({ serverId })).find((chat) => chat.id === channelId);

    const before = await unreadOf();
    expect(before?.unreadCount).toBe(2);

    // Viewing the Channel reads its own line; the Thread reply still counts.
    await owner.trpc.chat.markRead.mutate({
        chatId: channelId,
        sequence: before?.lastMessageSequence ?? 0,
        serverId,
    });
    expect((await unreadOf())?.unreadCount).toBe(1);

    const receipt = await owner.trpc.chat.markRead.mutate({
        chatId: channelId,
        includeThreads: true,
        sequence: before?.lastMessageSequence ?? 0,
        serverId,
    });
    expect(receipt.sequence).toBe(before?.lastMessageSequence);
    expect((await unreadOf())?.unreadCount).toBe(0);

    // A newer message makes the Channel unread again.
    await peer.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'One more thing.',
        nonce: 'mark-read-after',
        serverId,
    });
    expect((await unreadOf())?.unreadCount).toBe(1);
});
