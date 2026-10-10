import { expect, test } from 'bun:test';
import type { ChatMessage, TaskLabel } from '@haus/api';
import { chatMessagesQueryKey } from '../hooks/servers/use-chat-messages.ts';
import {
    createTranscriptCache,
    message,
    page,
    reaction,
    serverId,
    settle,
} from '../test-support/transcript-cache-harness.ts';

const chatId = 'cht_race';
const target = { chatId, messageId: `msg_${chatId}_1`, serverId };

test('a held direct entity fetch loses to the refetch a reaction event starts', async () => {
    const held = Promise.withResolvers<unknown>();
    let entityReads = 0;
    const cache = createTranscriptCache(async () => {
        entityReads += 1;
        return entityReads === 1
            ? held.promise
            : { message: message(chatId, 1, { reactions: [reaction('👍')] }), thread: null };
    });
    const row = cache.observeEntity(chatId, target.messageId);
    await settle(() => entityReads === 1);
    cache.coalescer.noteMessageAnnotated(target);
    await settle(() => entityReads === 2);
    held.resolve({ message: message(chatId, 1), thread: null });
    await settle(() => cache.entity(chatId, target.messageId)?.fetchStatus === 'idle');

    expect(cache.entity(chatId, target.messageId)?.data?.message.reactions).toEqual([
        reaction('👍'),
    ]);
    row.close();
});

test('overlapping list reads keep the dirty id until the last settles, and the entity ends current', async () => {
    const reads = {
        full: Promise.withResolvers<unknown>(),
        chain: Promise.withResolvers<unknown>(),
    };
    let fresh = false;
    const cache = createTranscriptCache((request) => {
        if (request.path === 'chat.message') {
            return Promise.resolve({
                message: message(chatId, 1, { reactions: fresh ? [reaction('🎉')] : [] }),
                thread: null,
            });
        }
        return request.input.replyRootMessageId ? reads.chain.promise : reads.full.promise;
    });
    const lists = [cache.observeList(chatId), cache.observeList(chatId, target.messageId)];
    await settle(() => cache.reads('chat.messages').length === 2);
    // Both reads started before the reaction committed: each answers with the old copy.
    fresh = true;
    cache.coalescer.noteMessageAnnotated(target);
    const row = cache.observeEntity(chatId, target.messageId);
    await settle(
        () => cache.entity(chatId, target.messageId)?.data?.message.reactions.length === 1
    );

    reads.chain.resolve(page([message(chatId, 1)]));
    await settle(() => cache.listIds(chatId, target.messageId)?.length === 1);
    await settle(
        () => cache.entity(chatId, target.messageId)?.data?.message.reactions.length === 1
    );
    const afterFirst = cache.reads('chat.message').length;

    reads.full.resolve(page([message(chatId, 1)]));
    await settle(() => cache.listIds(chatId)?.length === 1);
    await settle(
        () => cache.entity(chatId, target.messageId)?.data?.message.reactions.length === 1
    );

    // Each settlement re-invalidated the dirty id; the set cleared after the last.
    expect(cache.reads('chat.message').length).toBeGreaterThan(afterFirst);
    const settled = cache.reads('chat.message').length;
    await cache.queryClient.refetchQueries({ queryKey: chatMessagesQueryKey(serverId, chatId) });
    await settle();
    expect(cache.reads('chat.message').length).toBe(settled);
    for (const observed of [...lists, row]) {
        observed.close();
    }
});

test('a reaction on an absent entity lands after the list read in flight seeds it', async () => {
    const listRead = Promise.withResolvers<unknown>();
    const cache = createTranscriptCache((request) =>
        request.path === 'chat.message'
            ? Promise.resolve({
                  message: message(chatId, 1, { reactions: [reaction('👀')] }),
                  thread: null,
              })
            : listRead.promise
    );
    const list = cache.observeList(chatId);
    await settle(() => cache.reads('chat.messages').length === 1);
    cache.coalescer.noteMessageAnnotated(target);
    // The event's own invalidation lands first, on an entity not cached yet.
    await settle();
    cache.coalescer.flushInvalidations();
    listRead.resolve(page([message(chatId, 1)]));
    await settle(() => cache.listIds(chatId)?.length === 1);

    // The seeded copy predates the reaction, so it is invalidated; the row refetches it.
    expect(cache.entity(chatId, target.messageId)?.isInvalidated).toBe(true);
    const row = cache.observeEntity(chatId, target.messageId);
    await settle(
        () => cache.entity(chatId, target.messageId)?.data?.message.reactions.length === 1
    );
    list.close();
    row.close();
});

test('a label rename cancels the list read in flight; no entity keeps the old label', async () => {
    const label = (name: string): TaskLabel =>
        ({ color: 'blue', id: 'lbl_one', name }) as TaskLabel;
    const withLabel = (name: string): ChatMessage =>
        message(chatId, 1, { task: { labels: [label(name)] } as unknown as ChatMessage['task'] });
    let renamed = false;
    const inFlight = Promise.withResolvers<unknown>();
    let listReads = 0;
    const cache = createTranscriptCache((request) => {
        if (request.path === 'chat.message') {
            return Promise.resolve({ message: withLabel(renamed ? 'New' : 'Old'), thread: null });
        }
        listReads += 1;
        return listReads === 2
            ? inFlight.promise
            : Promise.resolve(page([withLabel(renamed ? 'New' : 'Old')]));
    });
    const list = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 1);
    const row = cache.observeEntity(chatId, target.messageId);
    void list.observer.refetch();
    await settle(() => listReads === 2);
    renamed = true;
    await cache.coalescer.noteTaskLabelUpdated({ labelId: 'lbl_one', serverId });
    cache.coalescer.flushInvalidations();
    inFlight.resolve(page([withLabel('Old')]));
    await settle(() => listReads === 3);
    await settle(() => labelName(cache) === 'New');
    await settle();

    expect(labelName(cache)).toBe('New');
    list.close();
    row.close();
});

test('a tail read held across a label rename never seeds the old label', async () => {
    const label = (name: string): TaskLabel =>
        ({ color: 'blue', id: 'lbl_one', name }) as TaskLabel;
    const second = (name: string): ChatMessage =>
        message(chatId, 2, { task: { labels: [label(name)] } as unknown as ChatMessage['task'] });
    let renamed = false;
    const tail = Promise.withResolvers<unknown>();
    const cache = createTranscriptCache((request) => {
        if (request.path === 'chat.message') {
            return Promise.resolve({ message: second(renamed ? 'New' : 'Old'), thread: null });
        }
        if (request.input.afterSequence !== undefined) {
            return tail.promise;
        }
        return Promise.resolve(
            page(renamed ? [message(chatId, 1), second('New')] : [message(chatId, 1)])
        );
    });
    const list = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 1);
    // Message 2 commits with the old label; its tail read is held in flight.
    cache.coalescer.noteMessageCreated({
        chatId,
        parentChatId: null,
        sequence: 2,
        serverId,
        threadAnchorMessageId: null,
    });
    await settle(() => cache.reads('chat.messages').length === 2);
    renamed = true;
    await cache.coalescer.noteTaskLabelUpdated({ labelId: 'lbl_one', serverId });
    cache.coalescer.flushInvalidations();
    // The bulk list refetch lands the renamed copy first.
    await settle(() => secondLabel(cache) === 'New');
    tail.resolve(page([second('Old')]));
    await settle();
    await settle();

    expect(secondLabel(cache)).toBe('New');
    expect(cache.listIds(chatId)).toEqual([`msg_${chatId}_1`, `msg_${chatId}_2`]);
    list.close();
});

test('a message created while an aborted tail read is still held gets its own tail', async () => {
    const tail = Promise.withResolvers<unknown>();
    let renamed = false;
    const cache = createTranscriptCache((request) => {
        if (request.input.afterSequence === 1) {
            return tail.promise;
        }
        if (request.input.afterSequence === 2) {
            return Promise.resolve(page([message(chatId, 3)]));
        }
        return Promise.resolve(
            page(renamed ? [message(chatId, 1), message(chatId, 2)] : [message(chatId, 1)])
        );
    });
    const list = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 1);
    cache.coalescer.noteMessageCreated(createdAt(2));
    await settle(() => cache.reads('chat.messages').length === 2);
    // The rename aborts the held tail; its drain stays open until the read settles.
    renamed = true;
    await cache.coalescer.noteTaskLabelUpdated({ labelId: 'lbl_one', serverId });
    cache.coalescer.flushInvalidations();
    await settle(() => cache.listIds(chatId)?.length === 2);
    cache.coalescer.noteMessageCreated(createdAt(3));
    tail.resolve(page([message(chatId, 2)]));
    await settle(() => cache.listIds(chatId)?.length === 3);

    expect(cache.reads('chat.messages').map((read) => read.input.afterSequence)).toEqual([
        undefined,
        1,
        undefined,
        2,
    ]);
    expect(cache.listIds(chatId)).toEqual([1, 2, 3].map((sequence) => `msg_${chatId}_${sequence}`));
    list.close();
});

test('a list read in flight across a Server loss lands and seeds nothing', async () => {
    const listRead = Promise.withResolvers<unknown>();
    const cache = createTranscriptCache(() => listRead.promise);
    const list = cache.observeList(chatId);
    await settle(() => cache.reads('chat.messages').length === 1);
    await cache.coalescer.purgeServer({ serverId });
    listRead.resolve(page([message(chatId, 1)]));
    await settle();

    expect(cache.entity(chatId, target.messageId)).toBeUndefined();
    expect(cache.listIds(chatId)).toBeUndefined();
    list.close();
});

test('a Chat purge removes its lists and entities, aborts its tails, and tells listeners', async () => {
    const tail = Promise.withResolvers<unknown>();
    const cache = createTranscriptCache((request) =>
        request.input.afterSequence === undefined
            ? Promise.resolve(page([message(request.input.chatId as string, 1)]))
            : tail.promise
    );
    const lists = [cache.observeList(chatId), cache.observeList('cht_other')];
    await settle(
        () => cache.listIds(chatId)?.length === 1 && cache.listIds('cht_other')?.length === 1
    );
    const purged: string[] = [];
    cache.coalescer.onChatPurged((scope) => purged.push(scope.chatId));
    cache.coalescer.noteMessageCreated({
        chatId,
        parentChatId: null,
        sequence: 2,
        serverId,
        threadAnchorMessageId: null,
    });
    await settle(() => cache.reads('chat.messages').length === 3);
    await cache.coalescer.purgeChat({ chatId, serverId });
    tail.resolve(page([message(chatId, 2)]));
    await settle();

    expect(purged).toEqual([chatId]);
    expect(cache.listIds(chatId)).toBeUndefined();
    expect(cache.entity(chatId, target.messageId)).toBeUndefined();
    expect(cache.entity(chatId, `msg_${chatId}_2`)).toBeUndefined();
    expect(cache.listIds('cht_other')).toEqual(['msg_cht_other_1']);
    for (const list of lists) {
        list.close();
    }
});

test('invalidations of one key coalesce into one refetch per frame', async () => {
    const cache = createTranscriptCache(async () => page([message(chatId, 1)]));
    const list = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 1);
    for (let index = 0; index < 3; index += 1) {
        cache.coalescer.recoverTranscriptLists({ serverId });
        cache.coalescer.invalidate({
            exact: true,
            queryKey: chatMessagesQueryKey(serverId, chatId),
        });
    }
    cache.coalescer.flushInvalidations();
    await settle(() => cache.reads('chat.messages').length === 2);
    await settle();

    expect(cache.reads('chat.messages').length).toBe(2);
    list.close();
});

function createdAt(sequence: number) {
    return { chatId, parentChatId: null, sequence, serverId, threadAnchorMessageId: null };
}

function secondLabel(cache: ReturnType<typeof createTranscriptCache>) {
    return cache.entity(chatId, `msg_${chatId}_2`)?.data?.message.task?.labels[0]?.name;
}

function labelName(cache: ReturnType<typeof createTranscriptCache>) {
    return cache.entity(chatId, target.messageId)?.data?.message.task?.labels[0]?.name;
}
