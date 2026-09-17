import { expect, test } from 'bun:test';
import type { ChatMessage } from '@haus/api';
import { mergeThreadMessagePages } from './use-thread-messages.ts';

test('Thread pages merge oldest-first without duplicate messages', () => {
    expect(
        mergeThreadMessagePages([
            { messages: [message('msg_new', 3)] },
            { messages: [message('msg_old', 1), message('msg_middle', 2)] },
        ]).map(({ id }) => id)
    ).toEqual(['msg_old', 'msg_middle', 'msg_new']);
});

function message(id: string, sequence: number): ChatMessage {
    return {
        attachments: [],
        author: { kind: 'human', userId: 'usr_author' },
        body: { kind: 'text' },
        chatId: 'cht_thread',
        content: id,
        createdAt: '2026-07-26T12:00:00.000Z',
        id,
        nonce: `nonce_${id}`,
        reactions: [],
        reply: null,
        runId: null,
        sequence,
        serverId: 'srv_one',
        sessionGeneration: null,
    };
}
