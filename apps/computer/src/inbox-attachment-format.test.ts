import { expect, test } from 'bun:test';
import type { AgentInboxItem } from './agent-inbox-item.ts';
import { composeInboxDrain, composeInboxNotice } from './inbox-format.ts';

const attachments = [
    { filename: 'plan.md', id: 'att_1' },
    { filename: 'mock.png', id: 'att_2' },
];

test('a drained envelope carries its Message attachments as the Raft suffix', () => {
    expect(composeInboxDrain([item({ message: { attachments } })], 'UTC')).toContain(
        '[target=#general msg=first time=2026-07-27 00:00:00 type=human] @zach: See attached' +
            ' [2 attachments: plan.md (id:att_1), mock.png (id:att_2) — use haus attachment view to download]'
    );
});

test('the attachment suffix precedes the inline reply context', () => {
    const drain = composeInboxDrain(
        [
            item({
                message: { attachments: [attachments[0]] },
                reply: {
                    parent: reference('msg_parent', 'Original ask'),
                    parentMessageId: 'msg_parent',
                    root: reference('msg_parent', 'Original ask'),
                    rootMessageId: 'msg_parent',
                },
            }),
        ],
        'UTC'
    );
    expect(drain).toContain(
        '@zach: See attached [1 attachment: plan.md (id:att_1) — use haus attachment view to download]\n[Inline reply context]'
    );
});

test('an attachment without its identity is counted, never guessed at', () => {
    expect(composeInboxDrain([item({ message: { attachments: [{ id: 'att_1' }] } })])).toContain(
        '@zach: See attached [1 attachment]'
    );
});

test('the content-free notice never names an attachment', () => {
    expect(composeInboxNotice([item({ message: { attachments } })])).not.toContain('plan.md');
});

function reference(id: string, content: string) {
    return {
        author: { kind: 'human' as const, userId: 'usr_zach' },
        content,
        createdAt: '2026-07-26T23:59:00.000Z',
        id,
        sequence: 1,
    };
}

function item(overrides: Partial<AgentInboxItem>): AgentInboxItem {
    return {
        chatId: 'cht_general',
        content: 'See attached',
        createdAt: '2026-07-27T00:00:00.000Z',
        id: 'msg_first',
        senderHandle: 'zach',
        senderType: 'human',
        sequence: 1,
        target: '#general',
        ...overrides,
    };
}
