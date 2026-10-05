import { describe, expect, test } from 'bun:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
    hydrateQueryCacheHandoff,
    packQueryCacheHandoff,
    parseQueryCacheHandoff,
} from './query-cache-handoff.ts';

const chatList = [['chat', 'list'], { input: { serverId: 's1' }, type: 'query' }];

function sourceClient() {
    const client = new QueryClient();
    client.setQueryData(chatList, [{ createdAt: new Date('2026-10-01T00:00:00Z'), id: 'c1' }]);
    client.setQueryData([['server', 'list'], { type: 'query' }], [{ id: 's1' }]);
    client.setQueryData(['haus-website-build'], { buildId: 'b' });
    client.setQueryData(
        [['computer', 'login', 'status'], { input: { userCode: 'X' }, type: 'query' }],
        {
            status: 'pending',
        }
    );
    client.setQueryData([['invitation', 'preview'], { input: { token: 't' }, type: 'query' }], {});
    return client;
}

function packedKeys(client: QueryClient) {
    return packQueryCacheHandoff(client, 'user_1')?.state.queries.map((query) => query.queryKey);
}

describe('packQueryCacheHandoff', () => {
    test('copies settled Server reads only', () => {
        expect(packedKeys(sourceClient())).toEqual([
            chatList,
            [['server', 'list'], { type: 'query' }],
        ]);
    });

    test('skips failed and pending reads', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        await client
            .fetchQuery({
                queryFn: () => Promise.reject(new Error('down')),
                queryKey: [['chat', 'get'], { type: 'query' }],
            })
            .catch(() => undefined);
        void client.prefetchQuery({
            queryFn: () => new Promise(() => undefined),
            queryKey: [['chat', 'pending'], { type: 'query' }],
        });
        expect(packedKeys(client)).toEqual([]);
    });

    test('skips subscription-kept reads that never refetch on mount', () => {
        const client = sourceClient();
        const key = [['agent', 'activeActivity'], { input: { serverId: 's1' }, type: 'query' }];
        client.setQueryData(key, []);
        const observer = new QueryObserver(client, {
            enabled: false,
            queryKey: key,
            refetchOnMount: false,
        });
        const unsubscribe = observer.subscribe(() => undefined);
        expect(packedKeys(client)).not.toContainEqual(key);
        unsubscribe();
    });

    test('hands off nothing without a user or over the size cap', () => {
        expect(packQueryCacheHandoff(sourceClient(), null)).toBeNull();
        expect(packQueryCacheHandoff(sourceClient(), 'user_1', 64)).toBeNull();
    });
});

describe('hydrateQueryCacheHandoff', () => {
    // Electron IPC carries the copy by structured clone.
    const carried = () =>
        parseQueryCacheHandoff(structuredClone(packQueryCacheHandoff(sourceClient(), 'user_1')));

    test('round-trips data, Dates included, and marks it stale', () => {
        const client = new QueryClient();
        expect(hydrateQueryCacheHandoff(client, carried(), 'user_1')).toBe(true);
        const [chat] = client.getQueryData<{ createdAt: Date }[]>(chatList) ?? [];
        expect(chat?.createdAt).toBeInstanceOf(Date);
        expect(chat?.createdAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
        expect(client.getQueryState(chatList)?.isInvalidated).toBe(true);
    });

    test('discards a copy from another user', () => {
        const client = new QueryClient();
        expect(hydrateQueryCacheHandoff(client, carried(), 'user_2')).toBe(false);
        expect(hydrateQueryCacheHandoff(client, carried(), null)).toBe(false);
        expect(client.getQueryCache().getAll()).toEqual([]);
    });

    test('rejects malformed payloads', () => {
        expect(parseQueryCacheHandoff(null)).toBeNull();
        expect(parseQueryCacheHandoff({ state: {}, userId: 'user_1' })).toBeNull();
        expect(
            parseQueryCacheHandoff({ state: { mutations: [], queries: [] }, userId: 1 })
        ).toBeNull();
    });
});
