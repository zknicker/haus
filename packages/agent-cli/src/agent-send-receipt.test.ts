import { expect, test } from 'bun:test';
import type { AgentCliMessage } from './agent-api-schemas.ts';
import { renderSentReceipt, sendPlacement } from './agent-send-receipt.ts';

function sentResponse() {
    return {
        failedImageGenerations: [],
        message: sent(),
        recentUnread: [],
        state: 'sent',
    } as unknown as Parameters<typeof renderSentReceipt>[1];
}

function sent(reply: AgentCliMessage['reply'] = null): AgentCliMessage {
    return {
        attachments: [],
        author: { id: 'agt_orbit', kind: 'agent', label: 'Orbit', metadata: {} },
        body_kind: 'text',
        chat_id: 'cht_general',
        content: 'The deploy is green.',
        created_at: '2026-10-14T12:00:00.000Z',
        deleted_at: null,
        delivery_id: null,
        id: 'msg_9f8e7d6c5b4a',
        metadata: {},
        nonce: null,
        reply,
        role: 'assistant',
        sender: { description: null, handle: 'orbit', type: 'agent' },
        sequence: 7,
    };
}

const replyReference = {
    author: { kind: 'human', userId: 'usr_zach' },
    content: 'Can you check the deploy?',
    createdAt: '2026-10-14T11:59:00.000Z',
    id: 'msg_1a2b3c4d5e6f',
    sequence: 6,
} satisfies NonNullable<AgentCliMessage['reply']>['parent'];

function replyTo(parent: NonNullable<AgentCliMessage['reply']>['parent']) {
    return {
        parent,
        parentMessageId: parent.id,
        root: parent,
        rootMessageId: parent.id,
    };
}

test('an inline reply to a human message says its author is notified', () => {
    expect(sendPlacement('#general', sent(replyTo(replyReference)), {})).toBe(
        'Posted in #general as an inline reply to message 1a2b3c4d; its author is notified.'
    );
});

test('an inline reply to an Agent message claims no notification', () => {
    const agentParent = {
        ...replyReference,
        author: { agentId: 'agt_pixel', kind: 'agent' },
    } satisfies NonNullable<AgentCliMessage['reply']>['parent'];
    expect(sendPlacement('#general', sent(replyTo(agentParent)), {})).toBe(
        'Posted in #general as an inline reply, quoted under message 1a2b3c4d.'
    );
});

test('an inline reply without a response reference falls back to the --reply-to value', () => {
    expect(sendPlacement('captain:@orbit', sent(), { replyToMessageId: '1234abcd' })).toBe(
        'Posted in captain:@orbit as an inline reply, quoted under message 1234abcd.'
    );
});

test('a top-level receipt names who sees it and suggests no other place', () => {
    expect(sendPlacement('#general', sent(), {})).toBe(
        'Posted at the top of #general; members see it in the channel.'
    );
    expect(sendPlacement('captain:@orbit', sent(), {})).toBe(
        'Posted at the top of captain:@orbit; its members see it in your Captain chat.'
    );
    expect(renderSentReceipt('#general', sentResponse(), {}).toLowerCase()).not.toContain('thread');
});

test('a Task receipt names the Task and its followers', () => {
    expect(sendPlacement('task:k3mq7xta', sent(), {})).toBe(
        "Posted in task:k3mq7xta; the Task's followers see it as unread, and anyone you @mentioned is notified."
    );
    expect(sendPlacement('task:k3mq7xta', sent(), { done: true })).toEndWith(
        'This closes your reply in this Task.'
    );
});

test('--done on a channel or Captain chat target closes the reply to that request', () => {
    expect(sendPlacement('#general', sent(replyTo(replyReference)), { done: true })).toBe(
        'Posted in #general as an inline reply to message 1a2b3c4d; its author is notified. This closes your reply to that request.'
    );
    expect(sendPlacement('captain:@orbit', sent(), { done: true })).toBe(
        'Posted at the top of captain:@orbit; its members see it in your Captain chat. This closes your reply to that request.'
    );
});
