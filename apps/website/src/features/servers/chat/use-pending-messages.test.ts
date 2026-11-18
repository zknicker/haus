import { afterEach, expect, test } from 'bun:test';
import {
    addPendingChatMessage,
    dropDeliveredPendingChatMessages,
    dropPendingChatMessage,
    readPendingChatMessages,
    resetPendingChatMessagesForTest,
    settlePendingChatMessage,
    visiblePendingChatMessages,
} from './use-pending-messages.ts';

const chatId = 'cht_pending';

function send(nonce: string, content: string) {
    addPendingChatMessage(chatId, { attachments: [], content, nonce });
}

afterEach(() => {
    resetPendingChatMessagesForTest();
});

test('rapid sends queue as separate pending rows in send order', () => {
    send('nonce_1', 'first');
    send('nonce_2', 'second');
    send('nonce_3', 'third');

    expect(readPendingChatMessages(chatId).map((message) => message.content)).toEqual([
        'first',
        'second',
        'third',
    ]);
});

test('a pending row retires only when its own durable message lands', () => {
    send('nonce_1', 'first');
    send('nonce_2', 'second');
    settlePendingChatMessage({
        chatId,
        createdAt: '2026-08-14T14:41:00.000Z',
        messageId: 'msg_1',
        nonce: 'nonce_1',
    });
    settlePendingChatMessage({
        chatId,
        createdAt: '2026-08-14T14:41:00.000Z',
        messageId: 'msg_2',
        nonce: 'nonce_2',
    });

    dropDeliveredPendingChatMessages(chatId, new Set(['msg_1']));

    expect(readPendingChatMessages(chatId).map((message) => message.content)).toEqual(['second']);
});

test('a durable row that beats its own receipt still retires the stand-in', () => {
    send('nonce_1', 'first');

    // The transcript learned about the message over the event stream before
    // the send resolved, so no message id has been recorded yet.
    dropDeliveredPendingChatMessages(chatId, new Set(['msg_1', 'nonce_1']));

    expect(readPendingChatMessages(chatId)).toEqual([]);
});

test('an unsettled row survives an unrelated transcript refresh', () => {
    send('nonce_1', 'still in flight');

    dropDeliveredPendingChatMessages(chatId, new Set(['msg_other']));

    expect(readPendingChatMessages(chatId)).toHaveLength(1);
});

test('a landed row is hidden in the same render that reports it', () => {
    send('nonce_1', 'first');
    settlePendingChatMessage({
        chatId,
        createdAt: '2026-08-14T14:41:00.000Z',
        messageId: 'msg_1',
        nonce: 'nonce_1',
    });

    expect(visiblePendingChatMessages(readPendingChatMessages(chatId), new Set(['msg_1']))).toEqual(
        []
    );
});

test('a failed send drops its row and leaves the others alone', () => {
    send('nonce_1', 'first');
    send('nonce_2', 'second');

    dropPendingChatMessage(chatId, 'nonce_1');

    expect(readPendingChatMessages(chatId).map((message) => message.content)).toEqual(['second']);
});

test('pending rows are scoped to their chat', () => {
    send('nonce_1', 'first');

    expect(readPendingChatMessages('cht_other')).toEqual([]);
});
