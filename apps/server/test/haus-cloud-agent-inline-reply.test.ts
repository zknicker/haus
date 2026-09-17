import { expect, test } from 'bun:test';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

test('an inline cloud card retains its channel and has its own detail thread', async () => {
    const parent = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Please fix the delivery failure.',
        nonce: 'inline-cloud-request',
        serverId: fixture.serverId,
    });
    const runner = await fixture.mintRunner('run_cloud_inline');
    const body = fixture.startBody({
        nonce: 'inline-cloud-start',
        replyToMessageId: parent.message.id,
    });
    const created = await fixture.postStart(runner, body);
    expect(created.status).toBe(200);
    expect(created.body.chatId).toBe(fixture.channelId);
    const history = await fixture.owner.trpc.chat.messages.query({
        chatId: fixture.channelId,
        serverId: fixture.serverId,
    });
    const card = history.messages.find(({ id }) => id === created.body.messageId);
    expect(card?.reply).toMatchObject({
        parentMessageId: parent.message.id,
        rootMessageId: parent.message.id,
    });
    expect(card?.body.kind).toBe('cloud-agent-work');
    const threads = await fixture.harness.sql`
        select anchor_message_id from chats
        where server_id = ${fixture.serverId} and parent_chat_id = ${fixture.channelId} and kind = 'thread'
    `;
    expect(threads).toEqual([{ anchor_message_id: created.body.messageId }]);
    expect((await fixture.postStart(runner, body)).body.idempotent).toBe(true);
    const changed = await fixture.postStart(runner, fixture.startBody({ nonce: body.nonce }));
    expect(changed.status).toBe(409);
    expect(await fixture.countWork()).toBe(1);
});

test('an invalid inline parent rejects cloud work before writes', async () => {
    const runner = await fixture.mintRunner('run_cloud_invalid_reply');
    const before = await fixture.countWork();
    const response = await fixture.postStart(
        runner,
        fixture.startBody({
            nonce: 'invalid-inline-cloud',
            replyToMessageId: 'msg_missing',
        })
    );
    expect(response.status).toBe(400);
    expect(await fixture.countWork()).toBe(before);
});
