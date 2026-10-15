import { expect, test } from 'bun:test';
import type { AgentCliMessage } from './agent-api-schemas.ts';
import { ownThreadLine, sendPlacement } from './agent-send-receipt.ts';

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

test('a channel thread receipt names the preview, unread followers, and who is notified', () => {
    expect(sendPlacement('#general:1a2b3c4d', sent(), {})).toBe(
        "Posted in the thread on message 1a2b3c4d in #general. The channel shows it as a one-line preview; followers see it as unread, and only that message's author and anyone you @mentioned are notified."
    );
});

test('a DM thread receipt says the peer is notified as for every DM message', () => {
    expect(sendPlacement('dm:@zach:1a2b3c4d', sent(), {})).toBe(
        'Posted in the thread on message 1a2b3c4d in dm:@zach; @zach is notified, as for every DM message.'
    );
});

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
    expect(sendPlacement('dm:@zach', sent(), { replyToMessageId: '1234abcd' })).toBe(
        'Posted in dm:@zach as an inline reply, quoted under message 1234abcd.'
    );
});

test('a top-level receipt names who sees it, then its own thread target as a fact', () => {
    expect(sendPlacement('#general', sent(), {})).toBe(
        'Posted at the top of #general; members see it in the channel.'
    );
    expect(ownThreadLine('#general', sent())).toEqual([
        'Thread on this message: #general:9f8e7d6c',
    ]);
    expect(sendPlacement('dm:@zach', sent(), {})).toBe(
        'Posted at the top of dm:@zach; @zach sees it in the DM.'
    );
    expect(ownThreadLine('dm:@zach', sent())).toEqual([
        'Thread on this message: dm:@zach:9f8e7d6c',
    ]);
});

test('an inline reply receipt states its own thread target', () => {
    expect(ownThreadLine('#general', sent(replyTo(replyReference)))).toEqual([
        'Thread on this message: #general:9f8e7d6c',
    ]);
});

test('a thread send states no thread target of its own, since threads cannot nest', () => {
    expect(ownThreadLine('#general:1a2b3c4d', sent())).toEqual([]);
    expect(ownThreadLine('dm:@zach:1a2b3c4d', sent())).toEqual([]);
});

test('--done on a channel or DM target closes the reply to that request', () => {
    expect(sendPlacement('#general', sent(replyTo(replyReference)), { done: true })).toBe(
        'Posted in #general as an inline reply to message 1a2b3c4d; its author is notified. This closes your reply to that request.'
    );
    expect(sendPlacement('dm:@zach', sent(), { done: true })).toBe(
        'Posted at the top of dm:@zach; @zach sees it in the DM. This closes your reply to that request.'
    );
});

test('--done on a thread target closes the reply in this thread', () => {
    expect(sendPlacement('#general:1a2b3c4d', sent(), { done: true })).toEndWith(
        'are notified. This closes your reply in this thread.'
    );
    expect(sendPlacement('dm:@zach:1a2b3c4d', sent(), { done: true })).toBe(
        'Posted in the thread on message 1a2b3c4d in dm:@zach; @zach is notified, as for every DM message. This closes your reply in this thread.'
    );
});
