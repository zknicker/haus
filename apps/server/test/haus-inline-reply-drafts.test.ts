import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { createInlineReplyHelpers } from './haus-inline-replies-helpers.ts';

const fixture = agentCreationFixture();
const { sendAgentRequest } = createInlineReplyHelpers(fixture);

test('held replies resolve short parent ids and retain the parent when sending the draft', async () => {
    const runner = await fixture.mintRunner('run_short_reply_draft');
    const root = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'An unread message holds the reply.',
        nonce: 'short_reply_draft_root',
        serverId: fixture.serverId,
    });
    const held = await sendAgentRequest(runner.token, {
        content: 'Reply saved for later.',
        nonce: 'short_reply_draft_hold',
        replyToMessageId: root.message.id.slice(4, 12),
        target: '#product',
    });
    expect(held).toMatchObject({ status: 200, body: { state: 'held' } });
    const drafts = await fixture.harness.sql`
        select reply_to_message_id from agent_message_drafts
        where server_id = ${fixture.serverId} and agent_id = ${fixture.orbitAgentId}
          and chat_id = ${fixture.channelId}
    `;
    expect(drafts).toHaveLength(1);
    expect(drafts[0].reply_to_message_id).toBe(root.message.id);

    const sent = await sendAgentRequest(runner.token, {
        nonce: 'short_reply_draft_send',
        sendDraft: true,
        target: '#product',
    });
    expect(sent).toMatchObject({
        status: 200,
        body: {
            state: 'sent',
            message: { reply: { parentMessageId: root.message.id } },
        },
    });
});

test('an invalid reply parent is rejected before saving a held draft', async () => {
    const runner = await fixture.mintRunner('run_invalid_reply_draft');
    await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Another unread message.',
        nonce: 'invalid_reply_draft_root',
        serverId: fixture.serverId,
    });
    const rejected = await sendAgentRequest(runner.token, {
        content: 'This reply has no parent.',
        nonce: 'invalid_reply_draft_hold',
        replyToMessageId: 'missing-parent',
        target: '#product',
    });
    expect(rejected).toMatchObject({
        status: 400,
        body: { code: 'INVALID_ARG' },
    });
    const drafts = await fixture.harness.sql`
        select reply_to_message_id from agent_message_drafts
        where server_id = ${fixture.serverId} and agent_id = ${fixture.orbitAgentId}
          and chat_id = ${fixture.channelId}
    `;
    expect(drafts).toHaveLength(0);
});
