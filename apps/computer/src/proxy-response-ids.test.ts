import { expect, test } from 'bun:test';
import { extractVisibleMessageIds } from './proxy-response-ids.ts';

const shown = {
    attachments: [],
    author: { id: 'usr_zach', kind: 'user', label: 'Zach', metadata: {} },
    body_kind: 'text',
    chat_id: 'cht_product',
    content: 'own it in tech ops though not here',
    created_at: '2026-09-04T12:00:07.000Z',
    deleted_at: null,
    delivery_id: null,
    id: 'msg_newer',
    metadata: {},
    nonce: null,
    role: 'user',
    sender: { description: null, handle: 'zach', type: 'human' },
    sequence: 107,
};

test('a held Cloud Agent launch reports the messages it showed, like a held send', () => {
    const held = JSON.stringify({
        formalMentionCount: 0,
        newMessageCount: 1,
        omittedMessageCount: 0,
        shownMessages: [shown],
        state: 'held',
    });
    expect(extractVisibleMessageIds('/api/agent/cloud-agents', held)).toEqual([
        { chatId: 'cht_product', id: 'msg_newer', sequence: 107 },
    ]);
    // A started launch and a follow-up show the model no Chat messages.
    expect(
        extractVisibleMessageIds('/api/agent/cloud-agents', JSON.stringify({ state: 'started' }))
    ).toEqual([]);
    expect(extractVisibleMessageIds('/api/agent/cloud-agents/send', held)).toEqual([]);
});
