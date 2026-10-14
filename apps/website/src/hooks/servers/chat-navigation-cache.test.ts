import { expect, test } from 'bun:test';
import type { ChatMessage } from '@haus/api';
import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { httpLink } from '@trpc/client';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryClientDefaultOptions } from '../../lib/query-policy.ts';
import { targetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';
import { readChatMessageEntity } from './chat-message-entities.ts';
import { chatMessagesQueryOptions } from './use-chat-messages.ts';

const serverId = 'srv_navigation';
const chatId = 'cht_navigation';
const page = {
    messages: [] as ChatMessage[],
    nextAfterSequence: null,
    nextBeforeSequence: null as number | null,
    scannedThroughSequence: 1,
    threads: [],
};

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

test('a message during an inactive preload lands by one tail read after it', async () => {
    const oldResponse = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<void>();
    const requests: string[] = [];
    const { client, options, queryClient } = cache((url) => {
        requests.push(url);
        started.resolve();
        return requests.length === 1
            ? oldResponse.promise
            : Promise.resolve(
                  response({
                      ...page,
                      messages: [message(2)],
                      scannedThroughSequence: 2,
                  })
              );
    });
    const preload = queryClient.prefetchInfiniteQuery(options);
    try {
        await started.promise;
        targetedReadCoalescer(queryClient, client).noteMessageCreated({
            chatId,
            parentChatId: null,
            sequence: 2,
            serverId,
            threadAnchorMessageId: null,
        });
        oldResponse.resolve(response({ ...page, nextBeforeSequence: 10 }));
        await preload;
        await until(() => requests.length === 2 && entryIds(queryClient).includes('msg_2'));

        expect(decodeURIComponent(requests[1] ?? '')).toContain('"afterSequence":1');
        expect(entryIds(queryClient)).toEqual(['msg_2']);
        expect(readChatMessageEntity(queryClient, serverId, chatId, 'msg_2')?.message.id).toBe(
            'msg_2'
        );
    } finally {
        oldResponse.resolve(response(page));
        queryClient.clear();
    }
});

function entryIds(queryClient: QueryClient) {
    const data = queryClient.getQueryData<{ pages: { entries: { id: string }[] }[] }>(
        chatMessagesQueryOptions(
            { client: hausTrpc.createClient({ links: [] }), queryClient },
            serverId,
            chatId
        ).queryKey
    );
    return data?.pages.flatMap((entry) => entry.entries.map(({ id }) => id)) ?? [];
}

async function until(done: () => boolean) {
    for (let attempt = 0; attempt < 100 && !done(); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

function response(data: typeof page) {
    return Response.json({ result: { data } });
}

function message(sequence: number): ChatMessage {
    return {
        attachments: [],
        author: { kind: 'human', userId: 'usr_navigation' },
        body: { kind: 'text' },
        chatId,
        cloudAgentWork: [],
        imageGenerations: [],
        content: `Message ${sequence}`,
        createdAt: '2026-10-09T12:00:00.000Z',
        id: `msg_${sequence}`,
        nonce: `nonce_${sequence}`,
        reactions: [],
        reply: null,
        runId: null,
        sequence,
        serverId,
        sessionGeneration: null,
    };
}

function cache(fetch: (url: string) => Promise<Response>) {
    const queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions });
    const client = hausTrpc.createClient({
        links: [httpLink({ fetch: (url) => fetch(String(url)), url: 'http://navigation.test' })],
    });
    return {
        client,
        options: chatMessagesQueryOptions({ client, queryClient }, serverId, chatId),
        queryClient,
    };
}
