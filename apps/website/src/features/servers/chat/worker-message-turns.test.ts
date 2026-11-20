import { expect, test } from 'bun:test';
import type { ChatMessage } from '@haus/api';
import { linkedMessage } from '../../../../../../packages/haus-api/src/worker-fixture.ts';
import { toChatMessageLayout } from '../../../hooks/servers/chat-message-layout.ts';
import { buildTranscriptEntries } from '../../chats/chat-transcript-model.ts';
import { projectChatMessageLayout } from './chat-message-model.ts';

test('a follow-up to a Worker stands as its own turn between plain messages', () => {
    const rows = [
        personMessage('msg_one', { kind: 'text' }, '2026-09-04T12:00:00.000Z'),
        personMessage(
            'msg_two',
            { kind: 'worker-follow-up', workerId: 'wkr_one' },
            '2026-09-04T12:01:00.000Z'
        ),
        personMessage('msg_three', { kind: 'text' }, '2026-09-04T12:02:00.000Z'),
    ].map((message) => projectChatMessageLayout(toChatMessageLayout(message), false));

    const entries = buildTranscriptEntries({ activeReplies: [], rows });

    expect(entries.map((entry) => (entry.kind === 'turn' ? entry.items.length : 0))).toEqual([
        1, 1, 1,
    ]);
});

function personMessage(id: string, body: ChatMessage['body'], createdAt: string) {
    return {
        ...linkedMessage,
        author: { kind: 'human', userId: 'usr_zach' },
        body,
        createdAt,
        id,
        nonce: `nonce_${id}`,
        runId: null,
    } satisfies ChatMessage;
}
