import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type NotificationFixture, startNotificationFixture } from './notification-fixture.ts';

let fixture: NotificationFixture;

beforeAll(async () => {
    fixture = await startNotificationFixture();
});

afterAll(async () => {
    await fixture.close();
});

test('a claim stops being visible when its parent Chat access is lost', async () => {
    const { createChannel, harness, owner, peer, peerUserId, serverId } = fixture;
    const promote = async (chatId: string, content: string) => {
        const { message } = await owner.trpc.chat.send.mutate({
            chatId,
            content,
            nonce: `claim-visibility-${chatId}`,
            serverId,
        });
        await owner.trpc.claim.promote.mutate({ messageId: message.id, serverId });
        return message.id;
    };
    const keptChatId = await createChannel('claim-kept');
    const lostChatId = await createChannel('claim-lost');
    const keptMessageId = await promote(keptChatId, 'Stays in view');
    const lostMessageId = await promote(lostChatId, 'Leaves with the Chat');
    const listed = async () =>
        (await peer.trpc.claim.list.query({ serverId })).claims.map(({ claim }) => claim.messageId);
    expect((await listed()).sort()).toEqual([keptMessageId, lostMessageId].sort());

    await harness.sql`
        delete from channel_participants
        where server_id = ${serverId} and chat_id = ${lostChatId} and user_id = ${peerUserId}
    `;

    expect(await listed()).toEqual([keptMessageId]);
});
