import { describe, expect, test } from 'bun:test';
import { serverReconciliationInterval } from './use-server.ts';

describe('Server query reconciliation', () => {
    test.each(['awaiting-computer', 'awaiting-cove', 'applying'] as const)(
        'keeps polling durable onboarding state during %s when realtime is missed',
        (phase) => {
            expect(serverReconciliationInterval({ onboarding: { phase } })).toBe(1000);
        }
    );

    test('stops polling after durable onboarding completion', () => {
        expect(serverReconciliationInterval({ onboarding: { phase: 'complete' } })).toBe(false);
        expect(serverReconciliationInterval(undefined)).toBe(false);
    });
});
