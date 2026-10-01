import { afterAll, beforeAll, expect, test } from 'bun:test';
import { pushNotificationPayloadSchema } from '@haus/api';
import type { HausClient } from './haus-client.ts';
import { type NotificationFixture, startNotificationFixture } from './notification-fixture.ts';
import { deviceToken, FakePushSender } from './push-fake-sender.ts';

const sender = new FakePushSender();
const adaToken = deviceToken('a1');
const boToken = deviceToken('b2');
const cassToken = deviceToken('c3');
let fixture: NotificationFixture;

beforeAll(async () => {
    fixture = await startNotificationFixture({ pushSender: sender });
    const bundleId = 'chat.haus.ios';
    await fixture.owner.trpc.push.registerDevice.mutate({
        bundleId,
        environment: 'sandbox',
        token: adaToken,
    });
    await fixture.peer.trpc.push.registerDevice.mutate({
        bundleId,
        environment: 'sandbox',
        token: boToken,
    });
    await fixture.outsider.trpc.push.registerDevice.mutate({
        bundleId,
        environment: 'production',
        token: cassToken,
    });
});

afterAll(async () => {
    await fixture.close();
});

test('a DM message pushes its other member with the routing payload', async () => {
    const { ownerUserId, peer, serverId } = fixture;
    const dmChatId = (await peer.trpc.chat.ensureDm.mutate({ peerUserId: ownerUserId, serverId }))
        .id;
    const sent = await peer.trpc.chat.send.mutate({
        chatId: dmChatId,
        content: `Got a minute, [@Ada](user://${ownerUserId})?\n\nIt is about the launch.`,
        nonce: 'push-dm',
        serverId,
    });

    const pushes = await sender.sentFor(sent.message.id, 1);
    expect(pushes).toEqual([
        {
            collapseId: sent.message.id,
            device: { bundleId: 'chat.haus.ios', environment: 'sandbox', token: adaToken },
            payload: {
                aps: {
                    alert: { body: 'Got a minute, @Ada? It is about the launch.', title: 'Bo' },
                    badge: await unreadChatCount(fixture.owner, [serverId]),
                    'mutable-content': 1,
                    sound: 'default',
                    'thread-id': dmChatId,
                },
                chatId: dmChatId,
                conversation: { kind: 'dm', name: null },
                conversationChatId: dmChatId,
                messageId: sent.message.id,
                reason: 'dm',
                sender: { avatarUrl: null, id: fixture.peerUserId, kind: 'human', name: 'Bo' },
                serverId,
                threadAnchorMessageId: null,
            },
        },
    ]);
    expect(pushNotificationPayloadSchema.parse(pushes[0]?.payload)).toEqual(
        pushes[0]?.payload as never
    );
});

test('a Channel mention pushes only mentioned humans with access, never the author', async () => {
    const { createChannel, ownerUserId, peer, peerUserId, serverId, harness } = fixture;
    const channelId = await createChannel('push-mentions');
    const cassUserId = (
        (await harness.sql`
            select id from users where clerk_user_id = 'user_notify_outsider'
        `) as { id: string }[]
    )[0]?.id;
    const long = 'x'.repeat(400);
    const sent = await peer.trpc.chat.send.mutate({
        chatId: channelId,
        content: `[@Ada](user://${ownerUserId}) [@Bo](user://${peerUserId}) [@Cass](user://${cassUserId}) ${long}`,
        nonce: 'push-mention',
        serverId,
    });

    const pushes = await sender.sentFor(sent.message.id, 1);
    expect(pushes.map((push) => push.device.token)).toEqual([adaToken]);
    const alert = pushes[0]?.payload.aps.alert;
    expect(alert?.title).toBe('Bo in #push-mentions');
    expect(pushes[0]?.payload.conversation).toEqual({ kind: 'channel', name: 'push-mentions' });
    expect(pushes[0]?.payload.reason).toBe('mention');
    expect(pushes[0]?.payload.sender).toMatchObject({ id: peerUserId, kind: 'human', name: 'Bo' });
    expect(alert?.body.length).toBeLessThanOrEqual(180);
    expect(alert?.body.startsWith('@Ada @Bo @Cass xxx')).toBe(true);
    expect(alert?.body.endsWith('…')).toBe(true);
});

test('an inline reply or a Thread answer pushes the author of the message it answers', async () => {
    const { createChannel, owner, peer, serverId } = fixture;
    const channelId = await createChannel('push-replies');
    const question = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Which region first?',
        nonce: 'push-reply-question',
        serverId,
    });
    const reply = await peer.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'us-east.',
        nonce: 'push-reply-inline',
        replyToMessageId: question.message.id,
        serverId,
    });
    const replyPushes = await sender.sentFor(reply.message.id, 1);
    expect(replyPushes.map((push) => push.device.token)).toEqual([adaToken]);
    expect(replyPushes[0]?.payload).toMatchObject({
        chatId: channelId,
        conversationChatId: channelId,
        reason: 'reply',
        threadAnchorMessageId: null,
    });

    const answer = await peer.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Then eu-west.',
        nonce: 'push-reply-thread',
        serverId,
        thread: { anchorMessageId: question.message.id },
    });
    const threadPushes = await sender.sentFor(answer.message.id, 1);
    expect(threadPushes.map((push) => push.device.token)).toEqual([adaToken]);
    expect(threadPushes[0]?.payload).toMatchObject({
        aps: { alert: { title: 'Bo in #push-replies' }, 'thread-id': channelId },
        chatId: answer.threadChatId,
        conversationChatId: channelId,
        reason: 'reply',
        threadAnchorMessageId: question.message.id,
    });

    // Ada's own message in her Thread pushes nobody: she never addresses
    // herself, and Bo is neither mentioned nor the anchor's author.
    const own = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Agreed.',
        nonce: 'push-reply-own',
        serverId,
        thread: { anchorMessageId: question.message.id },
    });
    expect(await sender.sentFor(own.message.id, 0)).toEqual([]);
});

test('every DM message pushes, whether or not the human read or answered the last one', async () => {
    const { owner, ownerUserId, peer, serverId } = fixture;
    const dmChatId = (await peer.trpc.chat.ensureDm.mutate({ peerUserId: ownerUserId, serverId }))
        .id;
    const first = await peer.trpc.chat.send.mutate({
        chatId: dmChatId,
        content: 'First nudge.',
        nonce: 'push-dm-every-1',
        serverId,
    });
    expect((await sender.sentFor(first.message.id, 1)).map((push) => push.device.token)).toEqual([
        adaToken,
    ]);

    // Reading the DM clears it from the badge but never stops the next push.
    await owner.trpc.chat.markRead.mutate({
        chatId: dmChatId,
        sequence: first.message.sequence,
        serverId,
    });
    const second = await peer.trpc.chat.send.mutate({
        chatId: dmChatId,
        content: 'Second nudge.',
        nonce: 'push-dm-every-2',
        serverId,
    });
    const pushes = await sender.sentFor(second.message.id, 1);
    expect(pushes.map((push) => push.device.token)).toEqual([adaToken]);
    expect(pushes[0]?.payload.aps.badge).toBe(await unreadChatCount(owner, [serverId]));
});

test('a Channel message that names nobody pushes nobody', async () => {
    const { createChannel, peer, serverId } = fixture;
    const channelId = await createChannel('push-quiet');
    const sent = await peer.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Deploy finished.',
        nonce: 'push-quiet',
        serverId,
    });
    expect(await sender.sentFor(sent.message.id, 0)).toEqual([]);
});

test('an Agent DM pushes its human, and APNs calling a token gone deletes it', async () => {
    const { harness, mintRunner, orbitAgentId, owner, sendAgentMessage, serverId } = fixture;
    const dmChatId = (
        await owner.trpc.chat.ensureAgentDm.mutate({ agentId: orbitAgentId, serverId })
    ).id;
    sender.outcomes.set(adaToken, { kind: 'device-gone', reason: 'Unregistered' });
    const orbit = await mintRunner(orbitAgentId, 'run_push_dm', dmChatId);
    const sent = await sendAgentMessage(orbit, 'dm:@ada', 'push-agent-dm', 'Should I run it?');

    const pushes = await sender.sentFor(sent.messageId, 1);
    expect(pushes.map((push) => push.payload.aps.alert)).toEqual([
        { body: 'Should I run it?', title: 'Orbit' },
    ]);
    expect(pushes[0]?.payload.sender).toMatchObject({ id: orbitAgentId, kind: 'agent' });
    expect(
        await harness.sql`select token from push_devices where token = ${adaToken}`
    ).toHaveLength(0);
});

test('the badge counts unread Chats across every Server, as chat.list reports them', async () => {
    const { owner, ownerUserId, peer, serverId } = fixture;
    sender.outcomes.delete(adaToken);
    await owner.trpc.push.registerDevice.mutate({
        bundleId: 'chat.haus.ios',
        environment: 'sandbox',
        token: adaToken,
    });
    const sideServerId = (
        await peer.trpc.server.create.mutate({ displayName: 'Side HQ', slug: 'side-hq' })
    ).id;
    const { token } = await peer.trpc.invitation.create.mutate({
        email: 'ada@haus.test',
        serverId: sideServerId,
    });
    await owner.trpc.invitation.accept.mutate({ token });
    const sideDmId = (
        await peer.trpc.chat.ensureDm.mutate({ peerUserId: ownerUserId, serverId: sideServerId })
    ).id;
    const sent = await peer.trpc.chat.send.mutate({
        chatId: sideDmId,
        content: 'Side question?',
        nonce: 'push-badge-side',
        serverId: sideServerId,
    });

    const here = await unreadChatCount(owner, [serverId]);
    expect(here).toBeGreaterThan(0);
    expect(await unreadChatCount(owner, [sideServerId])).toBeGreaterThanOrEqual(1);
    const pushes = await sender.sentFor(sent.message.id, 1);
    expect(pushes[0]?.payload.aps.badge).toBe(
        await unreadChatCount(owner, [serverId, sideServerId])
    );
});

/** What the badge means: Chats in `chat.list` with anything unread, summed over Servers. */
async function unreadChatCount(client: HausClient, serverIds: readonly string[]) {
    let count = 0;
    for (const serverId of serverIds) {
        const chats = await client.trpc.chat.list.query({ serverId });
        count += chats.filter((chat) => chat.unreadCount > 0).length;
    }
    return count;
}
