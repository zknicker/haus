import { expect, test } from 'bun:test';
import {
    createTranscriptCache,
    message,
    page,
    serverId,
    settle,
} from '../test-support/transcript-cache-harness.ts';

const chatId = 'cht_start';
const otherChatId = 'cht_after';

/** One stream start whose owned reads are the Server's transcript lists. */
function start(cache: ReturnType<typeof createTranscriptCache>) {
    cache.coalescer.reconcileStart(() => cache.coalescer.recoverTranscriptLists({ serverId }));
    cache.coalescer.flushInvalidations();
}

const listReads = (cache: ReturnType<typeof createTranscriptCache>, forChat: string) =>
    cache.reads('chat.messages').filter((request) => request.input.chatId === forChat).length;

test('a first start refetches a list fetched before it', async () => {
    const cache = createTranscriptCache(async () => page([message(chatId, 1)]));
    const list = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 1);

    start(cache);
    await settle(() => listReads(cache, chatId) === 2);
    await settle();

    expect(listReads(cache, chatId)).toBe(2);
    list.close();
});

test('a resubscribe after a reconnect refetches again: its read predates the new start', async () => {
    const cache = createTranscriptCache(async () => page([message(chatId, 1)]));
    const list = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 1);
    start(cache);
    await settle(() => listReads(cache, chatId) === 2);
    await settle(() => cache.queryClient.isFetching() === 0);

    start(cache);
    await settle(() => listReads(cache, chatId) === 3);
    await settle();

    expect(listReads(cache, chatId)).toBe(3);
    list.close();
});

test('a read fetched after the start is skipped; one fetched before is not', async () => {
    const cache = createTranscriptCache(async (request) =>
        page([message(request.input.chatId as string, 1)])
    );
    const before = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 1);

    // The start owns every transcript list by key prefix, one that exists and one that will.
    cache.coalescer.reconcileStart(() =>
        cache.coalescer.invalidate({ queryKey: [['chat', 'messages']] })
    );
    // Mounted after the start, inside its settle window: its first read began after it.
    const after = cache.observeList(otherChatId);
    await settle(() => cache.listIds(otherChatId)?.length === 1);
    cache.coalescer.flushInvalidations();
    await settle(() => listReads(cache, chatId) === 2);
    await settle();

    expect(listReads(cache, chatId)).toBe(2);
    expect(listReads(cache, otherChatId)).toBe(1);
    before.close();
    after.close();
});

test('a read only refetched after the start is skipped', async () => {
    const cache = createTranscriptCache(async () => page([message(chatId, 1)]));
    const list = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 1);

    cache.coalescer.reconcileStart(() => cache.coalescer.recoverTranscriptLists({ serverId }));
    // A live event refetched the list after the start, before the settle window closed.
    await list.observer.refetch();
    cache.coalescer.flushInvalidations();
    await settle();

    expect(listReads(cache, chatId)).toBe(2);
    list.close();
});

test('a read in flight across the start refetches even though it lands after', async () => {
    const held = Promise.withResolvers<unknown>();
    let reads = 0;
    const cache = createTranscriptCache(async () => {
        reads += 1;
        return reads === 1 ? held.promise : page([message(chatId, 1), message(chatId, 2)]);
    });
    const list = cache.observeList(chatId);
    await settle(() => reads === 1);

    start(cache);
    held.resolve(page([message(chatId, 1)]));
    await settle(() => reads === 2);
    await settle(() => cache.listIds(chatId)?.length === 2);

    expect(cache.listIds(chatId)).toEqual([`msg_${chatId}_1`, `msg_${chatId}_2`]);
    list.close();
});

test('a burst of starts in one settle window refetches each read once', async () => {
    const cache = createTranscriptCache(async () => page([message(chatId, 1)]));
    const list = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 1);

    for (let stream = 0; stream < 6; stream += 1) {
        cache.coalescer.reconcileStart(() => cache.coalescer.recoverTranscriptLists({ serverId }));
    }
    // The settle window closes on its own timer.
    await settle(() => listReads(cache, chatId) === 2);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(listReads(cache, chatId)).toBe(2);
    list.close();
});

test('an invalidation outside a start stays a plain frame invalidation', async () => {
    const cache = createTranscriptCache(async () => page([message(chatId, 1)]));
    const list = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 1);
    cache.coalescer.reconcileStart(() => undefined);

    cache.coalescer.recoverTranscriptLists({ serverId });
    cache.coalescer.flushInvalidations();
    await settle(() => listReads(cache, chatId) === 2);
    list.close();
});
