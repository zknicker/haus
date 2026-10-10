import { expect, test } from 'bun:test';
import { createRouter } from './trpc.ts';

/**
 * The iOS App's SSE stream session drops a stream after 45 silent seconds
 * (`TRPCSessions.streamIdleTimeout`). Without Server pings, every quiet healthy
 * stream would reconnect on that cadence.
 */
test('HTTP subscriptions ping well inside the client inactivity window', () => {
    const sse = createRouter({})._def._config.sse;

    expect(sse?.ping?.enabled).toBe(true);
    const intervalMs = sse?.ping?.intervalMs ?? Number.POSITIVE_INFINITY;
    const inactivityMs = sse?.client?.reconnectAfterInactivityMs ?? 0;
    expect(intervalMs * 2).toBeLessThan(inactivityMs);
    expect(inactivityMs).toBeLessThanOrEqual(45_000);
});
