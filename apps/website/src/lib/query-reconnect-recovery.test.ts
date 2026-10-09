import { describe, expect, test } from 'bun:test';
import {
    createQueryReconnectHandler,
    isReconnectRecoveredQuery,
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
            'member.list',
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
});
