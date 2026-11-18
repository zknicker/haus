import { expect, test } from 'bun:test';
import type { ChatMessageReply } from '@haus/api';
import { parseInbox } from './agent-inbox-input.ts';
import type { AgentInboxItem } from './agent-inbox-item.ts';
import { composeInboxDrain, composeInboxNotice } from './inbox-format.ts';
import { formatInlineReplyContext } from './inline-reply-format.ts';

const root = {
    author: { kind: 'human' as const, userId: 'usr_zach' },
    content: 'What is the weather?',
    createdAt: '2026-09-16T12:00:00Z',
    id: 'msg_weather',
    sequence: 1,
};
const reply: ChatMessageReply = {
    parent: root,
    parentMessageId: root.id,
    root,
    rootMessageId: root.id,
};
const item: AgentInboxItem = {
    chatId: 'cht_general',
    content: 'In Boston.',
    createdAt: '2026-09-16T12:01:00Z',
    id: 'msg_boston',
    reply,
    senderHandle: 'zach',
    senderType: 'human',
    sequence: 3,
    target: '#general',
};

test('a concrete reply carries its context while notices remain content-free', () => {
    const parsed = parseInbox([item]);
    expect(parsed?.[0]?.reply).toEqual(reply);
    const drain = composeInboxDrain(parsed ?? []);
    expect(drain).toContain('In Boston.');
    expect(drain).toContain('reply-to=msg_weather author=usr_zach: "What is the weather?"');
    const notice = composeInboxNotice(parsed ?? []);
    expect(notice).not.toContain('In Boston');
    expect(notice).not.toContain('What is the weather');
});

test('nested replies include distinct root context without duplicating a direct root', () => {
    expect(formatInlineReplyContext(reply)).not.toContain('\nroot=');
    const parent = { ...root, id: 'msg_answer', sequence: 2, content: 'Rain tomorrow.' };
    const formatted = formatInlineReplyContext({ ...reply, parent, parentMessageId: parent.id });
    expect(formatted).toContain('reply-to=msg_answer');
    expect(formatted).toContain('root=msg_weather');
});

test('invalid reply context is rejected at the Computer input boundary', () => {
    expect(parseInbox([{ ...item, reply: { parentMessageId: root.id } }])).toBeNull();
});
