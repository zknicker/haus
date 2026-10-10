import { expect, test } from 'bun:test';
import type { ChatMessage } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { visiblePendingChatMessages } from '../features/servers/chat/use-pending-messages.ts';
import { mergeTranscriptPages } from '../hooks/servers/chat-message-layout.ts';
import {
    createTranscriptCache,
    message,
    page,
    type ReadRequest,
    serverId,
    settle,
} from '../test-support/transcript-cache-harness.ts';
import { hausTrpc } from './haus-server.tsx';

const chatId = 'cht_tail';

test('a list read seeds every entity in one batch and issues no entity request', async () => {
    const thread = {
        anchorMessageId: `msg_${chatId}_2`,
        followed: true,
        latestReplyAt: null,
        recentReplies: [],
        replyCount: 1,
        threadChatId: 'cht_thread',
        unreadCount: 0,
    };
    const cache = createTranscriptCache(async () =>
        page([message(chatId, 1), message(chatId, 2)], { threads: [thread] })
    );
    const list = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 2);
    const rows = [1, 2].map((sequence) => cache.observeEntity(chatId, `msg_${chatId}_${sequence}`));

    expect(cache.entity(chatId, `msg_${chatId}_1`)?.data).toEqual({
        message: message(chatId, 1),
        thread: null,
    });
    expect(cache.entity(chatId, `msg_${chatId}_2`)?.data?.thread).toEqual(thread);
    expect(cache.reads('chat.message')).toEqual([]);
    for (const row of [list, ...rows]) {
        row.close();
    }
});

test('a search result never seeds an entity', async () => {
    const anchored = message(chatId, 1, {
        task: undefined,
    });
    const cache = createTranscriptCache(async (request) =>
        request.path === 'chat.search'
            ? [{ ...anchored, content: 'search projection' }]
            : page([anchored], {
                  threads: [
                      {
                          anchorMessageId: anchored.id,
                          followed: false,
                          latestReplyAt: null,
                          recentReplies: [],
                          replyCount: 3,
                          threadChatId: 'cht_thread',
                          unreadCount: 0,
                      },
                  ],
              })
    );
    const list = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 1);
    await cache.queryClient.fetchQuery({
        queryFn: () => cache.client.chat.search.query({ query: 'x', serverId } as never),
        queryKey: getQueryKey(hausTrpc.chat.search, { query: 'x', serverId }, 'query'),
    });

    // The search row lacks the Thread summary; the entity keeps the canonical one.
    expect(cache.entity(chatId, anchored.id)?.data?.thread?.replyCount).toBe(3);
    expect(cache.entity(chatId, anchored.id)?.data?.message.content).toBe('Message 1');
    list.close();
});

test('events during a held initial read drain into exactly one tail read', async () => {
    const initial = Promise.withResolvers<unknown>();
    const cache = createTranscriptCache((request) =>
        request.input.afterSequence === undefined
            ? initial.promise
            : Promise.resolve(page([message(chatId, 5), message(chatId, 6)]))
    );
    const list = cache.observeList(chatId);
    await settle(() => cache.reads('chat.messages').length === 1);
    for (const sequence of [5, 6]) {
        cache.coalescer.noteMessageCreated(created(sequence));
    }
    initial.resolve(page([message(chatId, 3), message(chatId, 4)]));
    await settle(() => cache.listIds(chatId)?.length === 4);
    await settle();

    expect(tailReads(cache.requests)).toEqual([4]);
    expect(cache.listIds(chatId)).toEqual(
        [3, 4, 5, 6].map((sequence) => `msg_${chatId}_${sequence}`)
    );
    expect(cache.entity(chatId, `msg_${chatId}_6`)?.data?.message.sequence).toBe(6);
    list.close();
});

test('a tail read fills a gap and reads again until caught up', async () => {
    const cache = createTranscriptCache(async (request) => {
        if (request.input.afterSequence === undefined) {
            return page([message(chatId, 1)]);
        }
        return request.input.afterSequence === 1
            ? page([message(chatId, 2), message(chatId, 3)], { nextAfterSequence: 3 })
            : page([message(chatId, 4)]);
    });
    const list = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 1);
    // The event for 2 and 3 was missed; the one for 4 recovers them.
    cache.coalescer.noteMessageCreated(created(4));
    await settle(() => cache.listIds(chatId)?.length === 4);

    expect(tailReads(cache.requests)).toEqual([1, 3]);
    list.close();
});

test('a duplicate or late event costs no read once the list has scanned past it', async () => {
    const cache = createTranscriptCache(async (request) =>
        request.input.afterSequence === undefined
            ? page([message(chatId, 1)])
            : page([message(chatId, 2)])
    );
    const list = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 1);
    cache.coalescer.noteMessageCreated(created(2));
    await settle(() => cache.listIds(chatId)?.length === 2);
    cache.coalescer.noteMessageCreated(created(2));
    cache.coalescer.noteMessageCreated(created(1));
    await settle();

    expect(tailReads(cache.requests)).toEqual([1]);
    expect(cache.listIds(chatId)).toEqual([`msg_${chatId}_1`, `msg_${chatId}_2`]);
    list.close();
});

test('an inline-reply chain gains only its chain and resumes after what it scanned', async () => {
    const root = message(chatId, 1);
    const cache = createTranscriptCache(async (request) => {
        if (request.input.afterSequence === undefined) {
            // The chain's last match is 1, but the read examined the Chat through 8.
            return page([root], { scannedThroughSequence: 8 });
        }
        return page(
            [message(chatId, 10, { reply: { parentMessageId: root.id } as ChatMessage['reply'] })],
            { scannedThroughSequence: 10 }
        );
    });
    const chain = cache.observeList(chatId, root.id);
    await settle(() => cache.listIds(chatId, root.id)?.length === 1);
    cache.coalescer.noteMessageCreated(created(10));
    await settle(() => cache.listIds(chatId, root.id)?.length === 2);

    expect(cache.reads('chat.messages').at(-1)?.input).toMatchObject({
        afterSequence: 8,
        replyRootMessageId: root.id,
    });
    chain.close();
});

test('a list scrolled into history is only marked stale when inactive', async () => {
    const cache = createTranscriptCache(async () =>
        page([message(chatId, 1)], { nextAfterSequence: 1 })
    );
    const list = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 1);
    list.close();
    cache.coalescer.noteMessageCreated(created(9));
    await settle();

    expect(tailReads(cache.requests)).toEqual([]);
    expect(
        cache.queryClient.getQueryCache().findAll({ stale: true, type: 'inactive' }).length
    ).toBeGreaterThan(0);
});

test('a tail-read row retires the pending send that carries its nonce', async () => {
    const cache = createTranscriptCache(async (request) =>
        request.input.afterSequence === undefined
            ? page([message(chatId, 1)])
            : page([message(chatId, 2, { nonce: 'nonce_pending' })])
    );
    const list = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 1);
    const pending = [
        {
            attachments: [],
            content: 'On its way',
            createdAt: null,
            messageId: null,
            nonce: 'nonce_pending',
            submittedAt: '2026-10-09T12:00:00.000Z',
        },
    ];
    cache.coalescer.noteMessageCreated(created(2));
    await settle(() => cache.listIds(chatId)?.length === 2);
    const entries = mergeTranscriptPages(list.observer.getCurrentResult().data?.pages)?.entries;
    const delivered = new Set(entries?.flatMap((entry) => [entry.id, entry.nonce]));

    expect(visiblePendingChatMessages(pending, delivered)).toEqual([]);
    list.close();
});

function created(sequence: number) {
    return { chatId, parentChatId: null, sequence, serverId, threadAnchorMessageId: null };
}

function tailReads(requests: readonly ReadRequest[]) {
    return requests
        .filter((request) => request.path === 'chat.messages')
        .flatMap((request) =>
            typeof request.input.afterSequence === 'number' ? [request.input.afterSequence] : []
        );
}
