import { expect, test } from 'bun:test';
import { chatMessageReactionReceiptSchema } from './chat.ts';
import { chatMessageReactionInputSchema } from './chat-message-reactions.ts';

test('reaction mutations carry only client intent and return a durable receipt shape', () => {
    expect(
        chatMessageReactionInputSchema.parse({
            emoji: ' 👍 ',
            messageId: 'msg_one',
            serverId: 'srv_main',
        })
    ).toEqual({ emoji: '👍', messageId: 'msg_one', remove: false, serverId: 'srv_main' });
    expect(() =>
        chatMessageReactionInputSchema.parse({
            actorUserId: 'usr_intruder',
            emoji: '👍',
            messageId: 'msg_one',
            serverId: 'srv_main',
        })
    ).toThrow();

    expect(
        chatMessageReactionReceiptSchema.parse({
            changed: true,
            message: {
                attachments: [],
                author: { kind: 'human', userId: 'usr_human' },
                body: { kind: 'text' },
                chatId: 'cht_all',
                content: 'Durable.',
                createdAt: '2026-07-26T12:00:00.000Z',
                id: 'msg_one',
                nonce: 'send-1',
                reactions: [],
                runId: null,
                sequence: 1,
                serverId: 'srv_main',
                sessionGeneration: null,
            },
        })
    ).toMatchObject({ changed: true, message: { id: 'msg_one' } });
});
