import { expect, test } from 'bun:test';
import {
    createTranscriptCache,
    message,
    page,
    serverId,
    settle,
} from '../../test-support/transcript-cache-harness.ts';
import {
    chatMessageEntityDefaults,
    chatMessageQueryKey,
    seedChatMessageEntities,
} from './chat-message-entities.ts';

const chatId = 'cht_entity';

test('a seeded-only entry takes the family policy, not the client default', () => {
    const cache = createTranscriptCache(() => new Promise(() => undefined));
    seedChatMessageEntities(cache.queryClient, page([message(chatId, 1)]));
    const query = cache.queryClient
        .getQueryCache()
        .find({ exact: true, queryKey: chatMessageQueryKey(serverId, chatId, `msg_${chatId}_1`) });

    expect(query?.options).toMatchObject(chatMessageEntityDefaults);
    expect(query?.isStale()).toBe(false);
});

test('an entity collected while its id stays listed fetches when a row observes it', async () => {
    const cache = createTranscriptCache(async (request) =>
        request.path === 'chat.message'
            ? { message: message(chatId, 1, { content: 'refetched' }), thread: null }
            : page([message(chatId, 1)])
    );
    const list = cache.observeList(chatId);
    await settle(() => cache.listIds(chatId)?.length === 1);
    cache.queryClient.removeQueries({
        exact: true,
        queryKey: chatMessageQueryKey(serverId, chatId, `msg_${chatId}_1`),
    });
    const row = cache.observeEntity(chatId, `msg_${chatId}_1`);
    await settle(
        () => cache.entity(chatId, `msg_${chatId}_1`)?.data?.message.content === 'refetched'
    );

    expect(cache.reads('chat.message')).toHaveLength(1);
    list.close();
    row.close();
});
