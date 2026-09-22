import { expect, test } from 'bun:test';
import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { httpLink } from '@trpc/client';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryClientDefaultOptions } from '../../lib/query-policy.ts';
import { messageEvent } from './chat-events/chat-event-fixtures.ts';
import { invalidateMessageCreated } from './chat-events/use-message-created-events.ts';
import { chatMessagesQueryOptions } from './use-chat-messages.ts';

const serverId = 'srv_navigation';
const chatId = 'cht_navigation';
const page = { messages: [], nextBeforeSequence: null, threads: [] };

test('preload shares an in-flight read and preserves paginated history on a warm return', async () => {
    const first = Promise.withResolvers<Response>();
    let reads = 0;
    const { options, queryClient } = cache(() => {
        reads += 1;
        return reads === 1 ? first.promise : Promise.resolve(response(page));
    });
    const preload = queryClient.prefetchInfiniteQuery(options);
    const duplicate = queryClient.prefetchInfiniteQuery(options);
    const observer = new InfiniteQueryObserver(queryClient, options);
    const close = observer.subscribe(() => {});
    try {
        first.resolve(response({ ...page, nextBeforeSequence: 10 }));
        await Promise.all([preload, duplicate]);
        expect(reads).toBe(1);
        await observer.fetchNextPage();
        expect(observer.getCurrentResult().data?.pageParams).toEqual([undefined, 10]);
        close();
        await queryClient.prefetchInfiniteQuery(options);
        const returned = new InfiniteQueryObserver(queryClient, options);
        expect(returned.getCurrentResult().data?.pages).toHaveLength(2);
        expect(reads).toBe(2);
    } finally {
        close();
        queryClient.clear();
    }
});

test('a message during an inactive preload cannot make the old response fresh on navigation', async () => {
    const oldResponse = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<void>();
    let reads = 0;
    const { options, queryClient, utils } = cache(() => {
        reads += 1;
        started.resolve();
        return reads === 1
            ? oldResponse.promise
            : Promise.resolve(response({ ...page, nextBeforeSequence: 20 }));
    });
    const preload = queryClient.prefetchInfiniteQuery(options);
    try {
        await started.promise;
        await invalidateMessageCreated({
            events: [messageEvent('2', chatId)],
            queryClient,
            serverId,
            utils,
        });
        oldResponse.resolve(response({ ...page, nextBeforeSequence: 10 }));
        await preload;
        const observer = new InfiniteQueryObserver(queryClient, options);
        const close = observer.subscribe(() => {});
        try {
            await queryClient.getQueryCache().find({ queryKey: options.queryKey })?.promise;
            expect(observer.getCurrentResult().data?.pages[0]?.nextBeforeSequence).toBe(20);
            expect(reads).toBe(2);
        } finally {
            close();
        }
    } finally {
        oldResponse.resolve(response(page));
        queryClient.clear();
    }
});

function response(data: {
    messages: never[];
    nextBeforeSequence: number | null;
    threads: never[];
}) {
    return Response.json({ result: { data } });
}

function cache(fetch: () => Promise<Response>) {
    const queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions });
    const client = hausTrpc.createClient({
        links: [httpLink({ fetch, url: 'http://navigation.test' })],
    });
    const utils = createTRPCQueryUtils({
        client,
        queryClient,
    });
    return {
        options: chatMessagesQueryOptions(client, serverId, chatId),
        queryClient,
        utils,
    };
}
