import { expect, test } from 'bun:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { createTRPCQueryUtils, getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { queryClientDefaultOptions, queryPolicy } from '../../../lib/query-policy.ts';
import { chatMessagesQueryKey } from '../use-chat-messages.ts';
import { threadMessagesQueryKey } from '../use-thread-messages.ts';
import { messageEvent } from './chat-event-fixtures.ts';
import { invalidateMessageCreated } from './use-message-created-events.ts';

test.each([
    'chat',
    'thread',
] as const)('reopening a %s recovers a message received while an older hidden request finishes', async (kind) => {
    const queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions });
    const input = { chatId: 'juniper', serverId: 'server_one' };
    const queryKey =
        kind === 'chat'
            ? chatMessagesQueryKey(input.serverId, input.chatId)
            : threadMessagesQueryKey(input.serverId, input.chatId);
    const olderResponse = Promise.withResolvers<number[]>();
    let reads = 0;
    const options = {
        ...queryPolicy.syncedSnapshot,
        queryKey,
        queryFn: () => (++reads === 1 ? olderResponse.promise : Promise.resolve([1, 2])),
    };
    const utils = createTRPCQueryUtils({
        client: hausTrpc.createClient({ links: [] }),
        queryClient,
    });
    const listKey = getQueryKey(hausTrpc.chat.list, { serverId: input.serverId }, 'query');
    queryClient.setQueryData(listKey, { unreadCount: 0 });
    const sidebar = new QueryObserver(queryClient, {
        ...queryPolicy.syncedSnapshot,
        queryKey: listKey,
        queryFn: () => Promise.resolve({ unreadCount: 1 }),
    });
    const closeSidebar = sidebar.subscribe(() => {});
    queryClient.setQueryData(queryKey, [1]);
    const dm = new QueryObserver(queryClient, options);
    const leaveDm = dm.subscribe(() => {});
    const pendingRead = dm.refetch();
    leaveDm();

    try {
        await invalidateMessageCreated({
            events: [messageEvent('2', input.chatId)],
            queryClient,
            serverId: input.serverId,
            utils,
        });
        expect(sidebar.getCurrentResult().data?.unreadCount).toBe(1);
        expect(reads).toBe(1);
        olderResponse.resolve([1]);
        await pendingRead;

        const reopened = new QueryObserver(queryClient, options);
        const closeDm = reopened.subscribe(() => {});
        try {
            // Reuse the mount-triggered request without forcing a stale cache to refresh.
            await queryClient.getQueryCache().find({ queryKey })?.promise;
            expect(reopened.getCurrentResult().data).toEqual([1, 2]);
            expect(reads).toBe(2);
        } finally {
            closeDm();
        }
    } finally {
        closeSidebar();
        olderResponse.resolve([1]);
        queryClient.clear();
    }
});

test('a message arriving during the first open transcript request starts a fresh read', async () => {
    const queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions });
    const input = { chatId: 'juniper', serverId: 'server_one' };
    const queryKey = chatMessagesQueryKey(input.serverId, input.chatId);
    const olderResponse = Promise.withResolvers<number[]>();
    let reads = 0;
    const observer = new QueryObserver(queryClient, {
        ...queryPolicy.syncedSnapshot,
        queryKey,
        queryFn: () => (++reads === 1 ? olderResponse.promise : Promise.resolve([1, 2])),
    });
    const close = observer.subscribe(() => {});
    const utils = createTRPCQueryUtils({
        client: hausTrpc.createClient({ links: [] }),
        queryClient,
    });

    try {
        const invalidation = invalidateMessageCreated({
            events: [messageEvent('2', input.chatId)],
            queryClient,
            serverId: input.serverId,
            utils,
        });
        await Promise.resolve();
        olderResponse.resolve([1]);
        await invalidation;
        expect(observer.getCurrentResult().data).toEqual([1, 2]);
        expect(reads).toBe(2);
    } finally {
        close();
        olderResponse.resolve([1]);
        queryClient.clear();
    }
});
