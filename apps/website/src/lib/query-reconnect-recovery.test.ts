import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import {
    createQueryReconnectHandler,
    isReconnectRecoveredQuery,
    recoverAfterReconnect,
    streamRecoveredReads,
} from './query-reconnect-recovery.ts';

test('reconciles durable queries after reconnecting without refetching on initial connect', () => {
    const states: string[] = [];
    let reconciliations = 0;
    const handleConnectionState = createQueryReconnectHandler({
        onReconnect: () => {
            reconciliations += 1;
        },
        onStateChange: (state) => states.push(state),
    });

    handleConnectionState('connected');
    expect(reconciliations).toBe(0);

    handleConnectionState('reconnecting');
    handleConnectionState('connected');

    expect(states).toEqual(['connected', 'reconnecting', 'connected']);
    expect(reconciliations).toBe(1);
});

test('a socket that reopens after any gap reconciles once', () => {
    let reconciliations = 0;
    const handleConnectionState = createQueryReconnectHandler({
        onReconnect: () => {
            reconciliations += 1;
        },
        onStateChange: () => undefined,
    });

    handleConnectionState('connected');
    handleConnectionState('connecting');
    handleConnectionState('connected');

    expect(reconciliations).toBe(1);
});

/**
 * A reconnect restarts every event stream, and each stream recovers its own
 * reads as it starts. The App-wide pass must cover only what no stream does,
 * or each of those reads refetches twice per reconnect.
 */
describe('reconnect recovery scope', () => {
    const trpcQuery = (path: string) => ({ queryKey: [path.split('.'), { type: 'query' }] });

    test('skips every read an event stream recovers as it restarts', () => {
        for (const reads of Object.values(streamRecoveredReads)) {
            for (const read of reads) {
                expect(isReconnectRecoveredQuery(trpcQuery(read))).toBe(false);
            }
        }
    });

    test('refetches Server reads no stream recovers', () => {
        for (const read of [
            'server.bySlug',
            'server.list',
            'invitation.list',
            'computer.list',
            'agent.deliveryState',
            'reminder.list',
            'stats.live',
        ]) {
            expect(isReconnectRecoveredQuery(trpcQuery(read))).toBe(true);
        }
    });

    test('leaves settled reads and non-Server polls to their own policies', () => {
        expect(isReconnectRecoveredQuery({ queryKey: ['haus-website-build'] })).toBe(false);
        expect(isReconnectRecoveredQuery({ queryKey: ['haus-release', 'latest'] })).toBe(false);
        expect(isReconnectRecoveredQuery(trpcQuery('agent.executionJournal'))).toBe(false);
    });

    test('root stream reads recover in the App-wide pass, not on their stream start', () => {
        for (const read of ['chat.list', 'chat.search', 'task.list', 'member.list']) {
            expect(isReconnectRecoveredQuery(trpcQuery(read))).toBe(true);
        }
    });
});

describe('reconnect pass', () => {
    const listKey = (serverId: string, chatId: string) => [
        ['chat', 'messages'],
        { input: { chatId, limit: 50, serverId }, type: 'infinite' },
    ];
    const entityKey = [
        ['chat', 'message'],
        { input: { chatId: 'cht_a', messageId: 'msg_1', serverId: 'srv_1' }, type: 'query' },
    ];
    const chatListKey = [['chat', 'list'], { input: { serverId: 'srv_1' }, type: 'query' }];

    test('recovers lists in bulk per Server, refetches Server reads once, and never entities', async () => {
        const queryClient = new QueryClient();
        for (const key of [
            listKey('srv_1', 'cht_a'),
            listKey('srv_1', 'cht_b'),
            listKey('srv_2', 'cht_c'),
        ]) {
            queryClient.setQueryData(key, { pageParams: [], pages: [] });
        }
        queryClient.setQueryData(entityKey, { message: null, thread: null });
        queryClient.setQueryData(chatListKey, []);
        const recovered: string[] = [];

        await recoverAfterReconnect(queryClient, {
            recoverTranscriptLists: ({ serverId }) => {
                recovered.push(serverId);
            },
        });

        expect(recovered.sort()).toEqual(['srv_1', 'srv_2']);
        const invalidated = (key: unknown[]) =>
            queryClient.getQueryCache().find({ exact: true, queryKey: key })?.state.isInvalidated;
        expect(invalidated(chatListKey)).toBe(true);
        expect(invalidated(entityKey)).toBe(false);
        // Lists are the coalescer's to recover, never the generic pass's.
        expect(invalidated(listKey('srv_1', 'cht_a'))).toBe(false);
    });
});
