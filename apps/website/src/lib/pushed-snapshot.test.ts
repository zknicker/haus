import { afterEach, expect, setSystemTime, test } from 'bun:test';
import { QueryClient, QueryObserver, type QueryObserverOptions } from '@tanstack/react-query';
import { createTRPCQueryUtils, getQueryKey } from '@trpc/react-query';
import { walkEventCatchUp } from '../hooks/servers/chat-events/chat-event-cursor.ts';
import {
    cloudAgentWorkEvent,
    lifecycleEvent,
} from '../hooks/servers/chat-events/chat-event-fixtures.ts';
import { createChatEventRegistry } from '../hooks/servers/chat-events/chat-event-registry.ts';
import { invalidateChatLifecycle } from '../hooks/servers/chat-events/use-chat-lifecycle-events.ts';
import { invalidateCloudAgentWorkChanges } from '../hooks/servers/chat-events/use-cloud-agent-work-events.ts';
import { recoverServerUpdateReads } from '../hooks/servers/use-server-events.ts';
import { hausTrpc } from './haus-server.tsx';
import { queryClientDefaultOptions, queryPolicy } from './query-policy.ts';

/**
 * `queryPolicy.pushedSnapshot` trades the 30 s timer for events: a remount
 * after any amount of time reads the cache, and only an event or a stream's
 * recovery makes it read the Server again.
 */
const serverId = 'server_one';
const start = new Date('2026-10-09T12:00:00.000Z');

afterEach(() => {
    setSystemTime();
});

test('a pushed read does not refetch on remount after the 30 s window', async () => {
    const { mount, reads } = harness(listKey(), queryPolicy.pushedSnapshot);
    await mount();
    later(10 * 60_000);
    await mount();
    expect(reads()).toBe(1);
});

test('a synced read does refetch on that remount (control)', async () => {
    const { mount, reads } = harness(listKey(), queryPolicy.syncedSnapshot);
    await mount();
    later(31_000);
    await mount();
    expect(reads()).toBe(2);
});

test('a covering event still refetches the pushed read on its next mount', async () => {
    const { mount, queryClient, reads, utils } = harness(listKey(), queryPolicy.pushedSnapshot);
    await mount();
    await invalidateChatLifecycle({
        events: [lifecycleEvent('5', 'chat_one', 'updated')],
        serverId,
        utils,
    });
    expect(reads()).toBe(1);
    await mount();
    expect(reads()).toBe(2);
    expect(queryClient.getQueryState(listKey())?.isInvalidated).toBe(false);
});

test('the Server stream recovers its pushed reads after a gap', async () => {
    const key = getQueryKey(hausTrpc.member.list, { serverId }, 'query');
    const { mount, reads, utils } = harness(key, queryPolicy.pushedSnapshot);
    await mount();
    later(10 * 60_000);
    await recoverServerUpdateReads(utils, serverId);
    await mount();
    expect(reads()).toBe(2);
});

test('a lifecycle event missed live is repaired by the Chat stream catch-up', async () => {
    const { mount, reads, utils } = harness(listKey(), queryPolicy.pushedSnapshot);
    await mount();
    // The socket was down when `chat_one` was renamed; nothing invalidated live.
    later(10 * 60_000);
    await mount();
    expect(reads()).toBe(1);

    const registry = createChatEventRegistry();
    registry.register(['chat.lifecycle'], (events, eventServerId) =>
        invalidateChatLifecycle({ events, serverId: eventServerId, utils })
    );
    await walkEventCatchUp({
        afterCursor: '4',
        fetchPage: async (afterCursor) =>
            afterCursor === '4' ? [lifecycleEvent('5', 'chat_one', 'updated')] : [],
        onEvents: (events) => registry.dispatch(events, serverId, 'catch-up'),
    });
    await mount();
    expect(reads()).toBe(2);
});

test('a Cloud Agent work change during a hover prefetch cannot leave the old answer fresh', async () => {
    const key = getQueryKey(
        hausTrpc.cloudAgentWork.listForChat,
        { chatId: 'chat_one', serverId },
        'query'
    );
    const older = Promise.withResolvers<string>();
    let reads = 0;
    const queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions });
    const utils = trpcUtils(queryClient);
    const options = {
        ...queryPolicy.pushedSnapshot,
        queryFn: () => (++reads === 1 ? older.promise : Promise.resolve('after')),
        queryKey: key,
    };
    const prefetch = queryClient.prefetchQuery(options);
    await invalidateCloudAgentWorkChanges({
        events: [cloudAgentWorkEvent('7', 'chat_one', null)],
        queryClient,
        serverId,
        utils,
    });
    older.resolve('before');
    await prefetch;

    const observer = new QueryObserver(queryClient, options);
    const close = observer.subscribe(() => {});
    try {
        await queryClient.getQueryCache().find({ queryKey: key })?.promise;
        expect(observer.getCurrentResult().data).toBe('after');
        expect(reads).toBe(2);
    } finally {
        close();
        queryClient.clear();
    }
});

function listKey() {
    return getQueryKey(hausTrpc.chat.list, { serverId }, 'query');
}

function later(ms: number) {
    setSystemTime(new Date(Date.now() + ms));
}

function trpcUtils(queryClient: QueryClient) {
    return createTRPCQueryUtils({ client: hausTrpc.createClient({ links: [] }), queryClient });
}

/** One read on a real query cache; each `mount` is a view opening it and closing again. */
function harness(
    queryKey: readonly unknown[],
    policy: Pick<QueryObserverOptions<number>, 'gcTime' | 'staleTime'>
) {
    setSystemTime(start);
    let reads = 0;
    const queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions });
    const options = {
        ...policy,
        queryFn: () => Promise.resolve(++reads),
        queryKey,
    };
    return {
        mount: async () => {
            const observer = new QueryObserver(queryClient, options);
            const close = observer.subscribe(() => {});
            await queryClient.getQueryCache().find({ queryKey })?.promise;
            close();
        },
        queryClient,
        reads: () => reads,
        utils: trpcUtils(queryClient),
    };
}
