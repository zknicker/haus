import { expect, test } from 'bun:test';
import { makeTestRuntime, settle } from '@haus/effect';
import type { Client } from '@modelcontextprotocol/client';
import { Exit, Scope, TestClock } from 'effect';
import { tick } from './runtime-test-fixtures.ts';
import { maintainToolSubscription } from './tool-subscription.ts';

test('client retirement joins stream cleanup and prevents subscription renewal', async () => {
    const runtime = makeTestRuntime();
    const scope = runtime.runSync(Scope.make());
    const cleanup = Promise.withResolvers<void>();
    const closed = Promise.withResolvers<'local'>();
    let closes = 0;
    let listens = 0;
    const client = {
        autoOpenedSubscription: {
            closed: closed.promise,
            honoredFilter: { toolsListChanged: true },
            async close() {
                closes += 1;
                await cleanup.promise;
                closed.resolve('local');
            },
        },
        listen() {
            listens += 1;
            throw new Error('Unexpected renewal');
        },
    } as unknown as Client;
    try {
        await maintainToolSubscription(
            client,
            new AbortController().signal,
            async () => undefined,
            (cause) => {
                throw cause;
            },
            { runtime, scope }
        );
        await tick();
        let stopped = false;
        const stopping = settle(runtime, Scope.close(scope, Exit.succeed(undefined))).then(() => {
            stopped = true;
        });
        await tick();
        expect(closes).toBe(1);
        expect(stopped).toBe(false);
        cleanup.resolve();
        await stopping;
        await runtime.runPromise(TestClock.adjust('1 minute'));
        expect(listens).toBe(0);
        expect(closes).toBe(1);
    } finally {
        cleanup.resolve();
        await settle(runtime, Scope.close(scope, Exit.succeed(undefined)));
        await runtime.dispose();
    }
});
