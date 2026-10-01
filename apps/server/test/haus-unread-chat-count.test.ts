import { afterAll, beforeAll, expect, test } from 'bun:test';
import { countUnreadChats } from '../src/chats/unread-chat-count.ts';
import { type NotificationFixture, startNotificationFixture } from './notification-fixture.ts';

let fixture: NotificationFixture;

beforeAll(async () => {
    fixture = await startNotificationFixture();
});

afterAll(async () => {
    await fixture.close();
});

/**
 * The unread-Chat count is its own query, but it must mean exactly what
 * `chat.list` means: the number of listed Chats with `unreadCount > 0`, summed
 * over the human's Servers. Every step below moves the count and re-proves the
 * equality — DM and Channel unread, Thread attention alone (mention and
 * follow), reads, archiving, a second Server, and leaving it.
 */
test('the unread-Chat count equals chat.list rows with anything unread, across Servers', async () => {
    const { createChannel, owner, ownerUserId, peer, serverId } = fixture;
    const servers = [serverId];
    let count = await expectCountMatchesList(servers);

    const dmId = (await peer.trpc.chat.ensureDm.mutate({ peerUserId: ownerUserId, serverId })).id;
    await peer.trpc.chat.send.mutate({ chatId: dmId, content: 'Ping', nonce: 'cnt-dm', serverId });
    count = await expectStep(servers, count, 1);

    const channelId = await createChannel('count-unread');
    await peer.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Top-level news.',
        nonce: 'cnt-channel',
        serverId,
    });
    count = await expectStep(servers, count, 1);

    // A read Channel whose only unread is a Thread reply mentioning the reader.
    const mentionChannelId = await createChannel('count-mention');
    const anchor = await peer.trpc.chat.send.mutate({
        chatId: mentionChannelId,
        content: 'Anchor.',
        nonce: 'cnt-mention-anchor',
        serverId,
    });
    await markAllRead(mentionChannelId);
    count = await expectStep(servers, count, 0);
    await peer.trpc.chat.send.mutate({
        chatId: mentionChannelId,
        content: `[@Ada](user://${ownerUserId}) a look?`,
        nonce: 'cnt-mention-reply',
        serverId,
        thread: { anchorMessageId: anchor.message.id },
    });
    expect(await unreadOf(mentionChannelId)).toBe(1);
    count = await expectStep(servers, count, 1);

    // An unfollowed Thread reply that names nobody stays out until followed.
    const followChannelId = await createChannel('count-follow');
    const followAnchor = await peer.trpc.chat.send.mutate({
        chatId: followChannelId,
        content: 'Another anchor.',
        nonce: 'cnt-follow-anchor',
        serverId,
    });
    await markAllRead(followChannelId);
    const reply = await peer.trpc.chat.send.mutate({
        chatId: followChannelId,
        content: 'Quiet reply.',
        nonce: 'cnt-follow-reply',
        serverId,
        thread: { anchorMessageId: followAnchor.message.id },
    });
    count = await expectStep(servers, count, 0);
    await owner.trpc.thread.setFollow.mutate({
        follow: true,
        serverId,
        threadChatId: reply.message.chatId,
    });
    count = await expectStep(servers, count, 1);

    await markAllRead(dmId);
    count = await expectStep(servers, count, -1);

    await owner.trpc.chat.archiveChannel.mutate({ chatId: channelId, serverId });
    count = await expectStep(servers, count, -1);

    const sideSlug = 'count-side';
    const sideServerId = (
        await peer.trpc.server.create.mutate({ displayName: 'Count Side', slug: sideSlug })
    ).id;
    const { token } = await peer.trpc.invitation.create.mutate({
        email: 'ada@haus.test',
        serverId: sideServerId,
    });
    await owner.trpc.invitation.accept.mutate({ token });
    const sideDmId = (
        await peer.trpc.chat.ensureDm.mutate({ peerUserId: ownerUserId, serverId: sideServerId })
    ).id;
    await peer.trpc.chat.send.mutate({
        chatId: sideDmId,
        content: 'Over here.',
        nonce: 'cnt-side-dm',
        serverId: sideServerId,
    });
    count = await expectStep([serverId, sideServerId], count, 1);

    // Leaving a Server drops its Chats from the count; counting never throws.
    await peer.trpc.member.remove.mutate({
        confirmation: sideSlug,
        serverId: sideServerId,
        userId: ownerUserId,
    });
    await expectStep(servers, count, -1);
});

async function expectStep(serverIds: readonly string[], before: number, delta: number) {
    const after = await expectCountMatchesList(serverIds);
    expect(after - before).toBe(delta);
    return after;
}

/** Proves the count equals `chat.list`'s unread rows, through the API and directly. */
async function expectCountMatchesList(serverIds: readonly string[]) {
    let listed = 0;
    for (const serverId of serverIds) {
        const chats = await fixture.owner.trpc.chat.list.query({ serverId });
        listed += chats.filter((chat) => chat.unreadCount > 0).length;
    }
    const { count } = await fixture.owner.trpc.chat.unreadChatCount.query();
    expect(count).toBe(listed);
    expect(await countUnreadChats(fixture.database.db, fixture.ownerUserId)).toBe(listed);
    return count;
}

async function unreadOf(chatId: string) {
    const chats = await fixture.owner.trpc.chat.list.query({ serverId: fixture.serverId });
    return chats.find((chat) => chat.id === chatId)?.unreadCount;
}

async function markAllRead(chatId: string) {
    const chats = await fixture.owner.trpc.chat.list.query({ serverId: fixture.serverId });
    const chat = chats.find((candidate) => candidate.id === chatId);
    await fixture.owner.trpc.chat.markRead.mutate({
        chatId,
        includeThreads: true,
        sequence: chat?.lastMessageSequence ?? 0,
        serverId: fixture.serverId,
    });
}
