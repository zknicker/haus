import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { HausClient } from './haus-client.ts';
import { type NotificationFixture, startNotificationFixture } from './notification-fixture.ts';
import { deviceToken, FakePushSender } from './push-fake-sender.ts';
import { startTestTask } from './task-place-fixture.ts';

// Long enough for a markRead right after the send to land inside it.
const readGraceMs = 600;
const sender = new FakePushSender();
const adaToken = deviceToken('a1');
const boToken = deviceToken('b2');
let fixture: NotificationFixture;

beforeAll(async () => {
    fixture = await startNotificationFixture({ pushReadGraceMs: readGraceMs, pushSender: sender });
    for (const [client, token] of [
        [fixture.owner, adaToken],
        [fixture.peer, boToken],
    ] as const) {
        await client.trpc.push.registerDevice.mutate({
            bundleId: 'chat.haus.ios',
            environment: 'sandbox',
            token,
        });
    }
});

afterAll(async () => {
    await fixture.close();
});

test('a DM its member reads within the grace period pushes nobody', async () => {
    const { owner, ownerUserId, peer, serverId } = fixture;
    const captainChatId = (
        await peer.trpc.chat.ensureDm.mutate({ peerUserId: ownerUserId, serverId })
    ).id;
    const sent = await peer.trpc.chat.send.mutate({
        chatId: captainChatId,
        content: 'Seen this on your desktop?',
        nonce: 'grace-dm-read',
        serverId,
    });
    await owner.trpc.chat.markRead.mutate({
        chatId: captainChatId,
        sequence: sent.message.sequence,
        serverId,
    });
    expect(await settledPushes(sent.message.id)).toEqual([]);
});

test('a DM left unread pushes after the grace period with the unread badge', async () => {
    const { owner, ownerUserId, peer, serverId } = fixture;
    const captainChatId = (
        await peer.trpc.chat.ensureDm.mutate({ peerUserId: ownerUserId, serverId })
    ).id;
    const startedAt = Date.now();
    const sent = await peer.trpc.chat.send.mutate({
        chatId: captainChatId,
        content: 'Still there?',
        nonce: 'grace-dm-unread',
        serverId,
    });
    const pushes = await sender.sentFor(sent.message.id, 1);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(readGraceMs);
    expect(pushes.map((push) => push.device.token)).toEqual([adaToken]);
    expect(pushes[0]?.payload.aps.badge).toBe(await unreadChatCount(owner, [serverId]));
    expect(pushes[0]?.payload.aps.badge).toBeGreaterThan(0);
});

test('a Channel mention of two humans pushes only the one who has not read it', async () => {
    const { createChannel, mintRunner, orbitAgentId, owner, ownerUserId, peer, peerUserId } =
        fixture;
    const { sendAgentMessage, serverId } = fixture;
    const channelId = await createChannel('grace-two');
    const orbit = await mintRunner(orbitAgentId, 'run_grace_two', channelId);
    const sent = await sendAgentMessage(
        orbit,
        '#grace-two',
        'grace-two',
        `[@Ada](user://${ownerUserId}) [@Bo](user://${peerUserId}) ship it?`
    );
    const [message] = (await fixture.harness.sql`
        select sequence from chat_messages where id = ${sent.messageId}
    `) as { sequence: number }[];
    await peer.trpc.chat.markRead.mutate({
        chatId: channelId,
        sequence: Number(message?.sequence),
        serverId,
    });

    const pushes = await settledPushes(sent.messageId);
    expect(pushes.map((push) => push.device.token)).toEqual([adaToken]);
    expect(pushes[0]?.payload.aps.badge).toBe(await unreadChatCount(owner, [serverId]));
});

test('a Task message is skipped only when the Task itself was read', async () => {
    const { createChannel, harness, owner, ownerUserId, peer, serverId } = fixture;
    const channelId = await createChannel('grace-task');
    const task = await startTestTask(harness, owner, {
        channelId,
        serverId,
        title: 'Pick the first region',
    });
    const [origin] = (await harness.sql`
        select sequence from chat_messages where id = ${task.originMessageId}
    `) as { sequence: number }[];

    const first = await peer.trpc.chat.send.mutate({
        chatId: task.chatId,
        content: `[@Ada](user://${ownerUserId}) us-east.`,
        nonce: 'grace-task-first',
        serverId,
    });
    await owner.trpc.chat.markRead.mutate({
        chatId: channelId,
        sequence: Number(origin?.sequence),
        serverId,
    });
    const firstPushes = await settledPushes(first.message.id);
    expect(firstPushes.map((push) => push.device.token)).toEqual([adaToken]);
    expect(firstPushes[0]?.payload).toMatchObject({ reason: 'mention', taskId: task.id });

    const second = await peer.trpc.chat.send.mutate({
        chatId: task.chatId,
        content: `[@Ada](user://${ownerUserId}) then eu-west.`,
        nonce: 'grace-task-second',
        serverId,
    });
    await owner.trpc.chat.markRead.mutate({
        chatId: task.chatId,
        sequence: second.message.sequence,
        serverId,
    });
    expect(await settledPushes(second.message.id)).toEqual([]);
});

/** Every push for a message once its grace period has certainly passed. */
async function settledPushes(messageId: string) {
    await Bun.sleep(readGraceMs + 400);
    return await sender.sentFor(messageId, 0);
}

async function unreadChatCount(client: HausClient, serverIds: readonly string[]) {
    let count = 0;
    for (const serverId of serverIds) {
        count += (await client.trpc.chat.unreadPreviews.query({ serverId })).previews.length;
    }
    return count;
}
