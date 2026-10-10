import { describe, expect, test } from 'bun:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
    forgiveRelistedServers,
    globalReadNamespaces,
    globalReads,
    isServerScopedQuery,
    runChatLoss,
    runServerLoss,
} from './server-loss.ts';

const trpc = (path: string, input?: Record<string, unknown>, data?: unknown) => ({
    queryKey: [path.split('.'), { input, type: 'query' }],
    state: { data },
});

describe('Server-scoped query predicate', () => {
    test('matches every Server-scoped family by input, App key, or cached Server identity', () => {
        for (const family of [
            'agent.get',
            'agent.list',
            'chat.list',
            'chat.search',
            'chat.message',
            'member.list',
            'invitation.list',
            'reminder.list',
            'task.list',
            'taskLabel.list',
            'stats.live',
            'cloudAgentSettings.get',
        ]) {
            expect(isServerScopedQuery(trpc(family, { serverId: 'srv_a' }), 'srv_a')).toBe(true);
            expect(isServerScopedQuery(trpc(family, { serverId: 'srv_b' }), 'srv_a')).toBe(false);
        }
        const bySlug = trpc('server.bySlug', { slug: 'a-room' }, { id: 'srv_a' });
        expect(isServerScopedQuery(bySlug, 'srv_a')).toBe(true);
        expect(isServerScopedQuery(bySlug, 'srv_b')).toBe(false);
        const appKey = { queryKey: ['haus-turn-outlines', 'srv_a', 'agt_1'], state: {} };
        expect(isServerScopedQuery(appKey, 'srv_a')).toBe(true);
        expect(isServerScopedQuery(appKey, 'srv_b')).toBe(false);
    });

    test('keeps global reads: the Server list, session, push, and account reads', () => {
        expect(globalReads).toEqual(['server.list']);
        expect(isServerScopedQuery(trpc('server.list', { serverId: 'srv_a' }), 'srv_a')).toBe(
            false
        );
        for (const namespace of globalReadNamespaces) {
            expect(
                isServerScopedQuery(trpc(`${namespace}.get`, { serverId: 'srv_a' }), 'srv_a')
            ).toBe(false);
        }
        expect(isServerScopedQuery({ queryKey: ['haus-website-build'], state: {} }, 'srv_a')).toBe(
            false
        );
    });
});

describe('Chat-loss purge', () => {
    test('drops every read of the deleted Chat and nothing of its siblings', async () => {
        const queryClient = new QueryClient();
        const purged: string[] = [];
        const key = (path: string, chatId: string) => [
            path.split('.'),
            { input: { chatId, serverId: 'srv_a' }, type: 'query' },
        ];
        for (const chatId of ['cht_gone', 'cht_kept']) {
            queryClient.setQueryData(key('chat.get', chatId), { id: chatId });
            queryClient.setQueryData(key('cloudAgentWork.listForChat', chatId), []);
        }

        await runChatLoss({
            chatId: 'cht_gone',
            coalescer: {
                purgeChat: async ({ chatId }) => {
                    purged.push(chatId);
                },
            },
            queryClient,
            serverId: 'srv_a',
        });

        expect(purged).toEqual(['cht_gone']);
        const left = queryClient
            .getQueryCache()
            .getAll()
            .map((query) => JSON.stringify(query.queryKey));
        expect(left.filter((entry) => entry.includes('cht_gone'))).toEqual([]);
        expect(left.filter((entry) => entry.includes('cht_kept'))).toHaveLength(2);
    });
});

describe('Server-loss path', () => {
    test('runs once per Server, and a newer Server list naming it again forgives it', async () => {
        const queryClient = new QueryClient();
        const purged: string[] = [];
        const coalescer = {
            purgeServer: async ({ serverId }: { serverId: string }) => {
                purged.push(serverId);
            },
        };
        queryClient.setQueryData([['chat', 'list'], { input: { serverId: 'srv_a' } }], []);

        await runServerLoss({ coalescer, queryClient, serverId: 'srv_a' });
        await runServerLoss({ coalescer, queryClient, serverId: 'srv_a' });
        expect(purged).toEqual(['srv_a']);
        expect(queryClient.getQueryCache().getAll()).toHaveLength(0);

        forgiveRelistedServers(queryClient, ['srv_a'], 0);
        await runServerLoss({ coalescer, queryClient, serverId: 'srv_a' });
        expect(purged).toEqual(['srv_a']);

        forgiveRelistedServers(queryClient, ['srv_a'], Date.now() + 1);
        await runServerLoss({ coalescer, queryClient, serverId: 'srv_a' });
        expect(purged).toEqual(['srv_a', 'srv_a']);
    });

    test('a Server detail a mounted view still observes fails closed instead of rendering cache', async () => {
        // Regression: `server.bySlug` matches by its cached Server, which the reset clears.
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const queryKey = [['server', 'bySlug'], { input: { slug: 'a-room' }, type: 'query' }];
        queryClient.setQueryData(queryKey, { id: 'srv_a', slug: 'a-room' });
        const observer = new QueryObserver(queryClient, {
            queryFn: () => Promise.reject(new Error('FORBIDDEN')),
            queryKey,
            staleTime: 30_000,
        });
        const stop = observer.subscribe(() => undefined);

        await runServerLoss({
            coalescer: { purgeServer: async () => undefined },
            queryClient,
            serverId: 'srv_a',
        });
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(observer.getCurrentResult()).toMatchObject({ data: undefined, status: 'error' });
        stop();
    });
});
