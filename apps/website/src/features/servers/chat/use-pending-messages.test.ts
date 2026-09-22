import { afterEach, expect, test } from 'bun:test';
import {
    addPendingChatMessage,
    dropDeliveredPendingChatMessages,
    dropPendingChatMessage,
    pendingThreadReplyKey,
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

const anchorId = 'msg_anchor';
const threadKey = pendingThreadReplyKey(anchorId);

function reply(nonce: string, content: string) {
    addPendingChatMessage(threadKey, { attachments: [], content, nonce });
}

test('a Thread keys its pending replies apart from its parent chat', () => {
    reply('nonce_1', 'first reply');

    expect(threadKey).not.toBe(anchorId);
    expect(readPendingChatMessages(chatId)).toEqual([]);
    expect(readPendingChatMessages(threadKey).map((message) => message.content)).toEqual([
        'first reply',
    ]);
});

test('a first reply keeps its row while the Thread it created is still loading', () => {
    reply('nonce_1', 'first reply');
    // The receipt named the Thread, but its replies query has not resolved yet,
    // so the Thread transcript still reports no delivered messages.
    settlePendingChatMessage({
        chatId: threadKey,
        createdAt: '2026-08-14T14:41:00.000Z',
        messageId: 'msg_reply',
        nonce: 'nonce_1',
    });

    expect(visiblePendingChatMessages(readPendingChatMessages(threadKey), new Set())).toHaveLength(
        1
    );
});

test('a first reply retires once the new Thread transcript carries it', () => {
    reply('nonce_1', 'first reply');
    settlePendingChatMessage({
        chatId: threadKey,
        createdAt: '2026-08-14T14:41:00.000Z',
        messageId: 'msg_reply',
        nonce: 'nonce_1',
    });

    dropDeliveredPendingChatMessages(threadKey, new Set(['msg_reply']));

    expect(readPendingChatMessages(threadKey)).toEqual([]);
});

test('a later reply retires on the same anchor key the first one used', () => {
    reply('nonce_1', 'first reply');
    dropDeliveredPendingChatMessages(threadKey, new Set(['nonce_1']));
    reply('nonce_2', 'second reply');

    dropDeliveredPendingChatMessages(threadKey, new Set(['nonce_1', 'nonce_2']));

    expect(readPendingChatMessages(threadKey)).toEqual([]);
});

test('a failed first reply leaves the Thread with no pending row', () => {
    reply('nonce_1', 'first reply');

    dropPendingChatMessage(threadKey, 'nonce_1');

    expect(readPendingChatMessages(threadKey)).toEqual([]);
});

test('two Threads on the same chat keep their pending replies apart', () => {
    reply('nonce_1', 'first reply');

    expect(readPendingChatMessages(pendingThreadReplyKey('msg_other_anchor'))).toEqual([]);
});
