import { expect, test } from 'bun:test';
import { inboxMarkDoneInputSchema, needsYouRowSchema } from './needs-you.ts';
import { taskAssigneeRefSchema, taskCreateInputSchema } from './task.ts';
import { messageTaskSchema } from './task-shared.ts';

const latest = {
    author: { agentId: 'agt_orbit', kind: 'agent' },
    createdAt: '2026-09-29T12:00:00.000Z',
    messageId: 'msg_2',
    preview: 'The migration is staged. Should I run it?',
    sequence: 7,
};

const dmRow = {
    addressedCount: 1,
    chatId: 'cht_dm',
    chatKind: 'dm',
    chatPeerAgentId: 'agt_orbit',
    chatPeerUserId: null,
    conversationChatId: 'cht_dm',
    latest,
    reason: 'dm',
    threadAnchorMessageId: null,
};

const threadMentionRow = {
    addressedCount: 2,
    chatId: 'cht_thread',
    chatKind: 'channel',
    chatName: 'product',
    conversationChatId: 'cht_product',
    latest,
    reason: 'mention',
    threadAnchorMessageId: 'msg_anchor',
};

test('a Needs you row is a DM or a Channel mention or reply, never a mix', () => {
    expect(needsYouRowSchema.parse(dmRow)).toMatchObject({ reason: 'dm' });
    expect(needsYouRowSchema.parse(threadMentionRow)).toMatchObject({ reason: 'mention' });
    expect(needsYouRowSchema.parse({ ...threadMentionRow, reason: 'reply' })).toMatchObject({
        reason: 'reply',
    });
    expect(needsYouRowSchema.safeParse({ ...dmRow, reason: 'mention' }).success).toBe(false);
    expect(needsYouRowSchema.safeParse({ ...dmRow, reason: 'reply' }).success).toBe(false);
    expect(needsYouRowSchema.safeParse({ ...threadMentionRow, reason: 'dm' }).success).toBe(false);
    expect(needsYouRowSchema.safeParse({ ...threadMentionRow, chatKind: 'dm' }).success).toBe(
        false
    );
    expect(needsYouRowSchema.safeParse({ ...dmRow, reason: 'ask' }).success).toBe(false);
    expect(needsYouRowSchema.safeParse({ ...dmRow, addressedCount: 0 }).success).toBe(false);
});

test('a Thread row names its anchor and a top-level row is its own conversation', () => {
    expect(
        needsYouRowSchema.safeParse({ ...threadMentionRow, threadAnchorMessageId: null }).success
    ).toBe(false);
    expect(
        needsYouRowSchema.safeParse({ ...dmRow, threadAnchorMessageId: 'msg_anchor' }).success
    ).toBe(false);
});

test('markDone names one Chat and a positive sequence', () => {
    const input = { chatId: 'cht_dm', serverId: 'srv_1', throughSequence: 7 };
    expect(inboxMarkDoneInputSchema.parse(input)).toEqual(input);
    expect(inboxMarkDoneInputSchema.safeParse({ ...input, throughSequence: 0 }).success).toBe(
        false
    );
    expect(inboxMarkDoneInputSchema.safeParse({ ...input, messageId: 'msg_2' }).success).toBe(
        false
    );
});

test('tasks are held by Agents only', () => {
    expect(taskAssigneeRefSchema.safeParse({ agentId: 'agt_orbit' }).success).toBe(true);
    expect(taskAssigneeRefSchema.safeParse({ kind: 'human', userId: 'usr_ada' }).success).toBe(
        false
    );
    expect(messageTaskSchema.shape).not.toHaveProperty('assigneeUserId');
    expect(
        taskCreateInputSchema.safeParse({
            assigneeUserId: 'usr_ada',
            chatId: 'cht_product',
            content: 'Ship it',
            nonce: 'n1',
            serverId: 'srv_1',
        }).success
    ).toBe(false);
});
