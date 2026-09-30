import { expect, test } from 'bun:test';
import { makeTestRuntime, settle } from '@haus/effect';
import { Cause, Effect, Exit, Runtime, Scope } from 'effect';
import {
    type HausServerShutdownResources,
    makeHausServerShutdown,
} from './haus-server-shutdown.ts';

async function openShutdown(resources: HausServerShutdownResources) {
    const runtime = makeTestRuntime();
    const scope = await settle(runtime, Scope.make());
    const shutdown = await settle(runtime, makeHausServerShutdown());
    await settle(runtime, Scope.extend(shutdown.register(resources), scope));

    return {
        close: () => settle(runtime, shutdown.close(scope, Exit.succeed(undefined))),
        dispose: async () => {
            await settle(runtime, shutdown.close(scope, Exit.succeed(undefined))).catch(
                () => undefined
            );
            await runtime.dispose();
        },
        runtime,
        scope,
    };
}

test('drains recurring work before closing Server transports', async () => {
    const releaseRecurringWork = Promise.withResolvers<void>();
    const recurringStarted = Promise.withResolvers<void>();
    const events: string[] = [];
    const lifetime = await openShutdown({
        broadcastReconnectNotification: () => events.push('broadcast'),
        closeComputerSocket: () => {
            events.push('computer');
        },
        closeDatabase: async () => {
            events.push('database');
        },
        closeFastify: async () => {
            events.push('fastify');
        },
        closeHttpConnections: () => {
            events.push('http');
        },
        closeMcpRuntime: async () => {
            events.push('mcp');
        },
        closePostCommitWork: async () => {
            events.push('post-commit');
        },
        closeRecurringWork: async () => {
            events.push('recurring-start');
            recurringStarted.resolve();
            await releaseRecurringWork.promise;
            events.push('recurring-end');
        },
        closeWebSocketServer: () => {
            events.push('websocket');
        },
    });

    try {
        const closing = lifetime.close();
        await recurringStarted.promise;
        expect(events).toEqual(['broadcast', 'recurring-start']);
        releaseRecurringWork.resolve();
        await closing;

        expect(events).toEqual([
            'broadcast',
            'recurring-start',
            'recurring-end',
            'websocket',
            'http',
            'computer',
            'mcp',
            'fastify',
            'post-commit',
            'database',
        ]);
    } finally {
        await lifetime.dispose();
    }
});

test('runs every finalizer after multiple failures and preserves the first one', async () => {
    const firstFailure = new Error('recurring close failed');
    const laterFailure = new Error('MCP close failed');
    const events: string[] = [];
    const lifetime = await openShutdown({
        broadcastReconnectNotification: () => events.push('broadcast'),
        closeComputerSocket: () => {
            events.push('computer');
        },
        closeDatabase: async () => {
            events.push('database');
        },
        closeFastify: async () => {
            events.push('fastify');
        },
        closeHttpConnections: () => {
            events.push('http');
        },
        closeMcpRuntime: async () => {
            events.push('mcp');
            throw laterFailure;
        },
        closePostCommitWork: async () => {
            events.push('post-commit');
        },
        closeRecurringWork: async () => {
            events.push('recurring');
            throw firstFailure;
        },
        closeWebSocketServer: () => {
            events.push('websocket');
        },
    });

    try {
        await expect(lifetime.close()).rejects.toBe(firstFailure);
        expect(events).toEqual([
            'broadcast',
            'recurring',
            'websocket',
            'http',
            'computer',
            'mcp',
            'fastify',
            'post-commit',
            'database',
        ]);
    } finally {
        await lifetime.dispose();
    }
});

test('preserves the full composite Scope Cause at the lifecycle settlement seam', async () => {
    const firstDefect = new Error('first scope defect');
    const laterDefect = new Error('later scope defect');
    const events: string[] = [];
    const lifetime = await openShutdown({
        broadcastReconnectNotification: () => events.push('broadcast'),
        closeComputerSocket: () => {
            events.push('computer');
        },
        closeDatabase: async () => {
            events.push('database');
        },
        closeFastify: async () => {
            events.push('fastify');
        },
        closeHttpConnections: () => events.push('http'),
        closeMcpRuntime: async () => {
            events.push('mcp');
        },
        closePostCommitWork: async () => {
            events.push('post-commit');
        },
        closeRecurringWork: async () => {
            events.push('recurring');
        },
        closeWebSocketServer: () => {
            events.push('websocket');
        },
    });

    try {
        await settle(
            lifetime.runtime,
            Scope.extend(
                Effect.gen(function* () {
                    yield* Effect.addFinalizer(() => Effect.die(firstDefect));
                    yield* Effect.addFinalizer(() => Effect.die(laterDefect));
                }),
                lifetime.scope
            )
        );

        let compositeCause: Cause.Cause<unknown> | null = null;
        await lifetime.close().catch((error: unknown) => {
            expect(Runtime.isFiberFailure(error)).toBe(true);
            if (Runtime.isFiberFailure(error)) {
                compositeCause = error[Runtime.FiberFailureCauseId];
            }
        });
        expect(compositeCause).not.toBeNull();
        if (!compositeCause) {
            throw new Error('Expected the lifecycle settlement seam to retain the Scope Cause.');
        }
        expect(Array.from(Cause.defects(compositeCause))).toEqual(
            expect.arrayContaining([firstDefect, laterDefect])
        );
        expect(events).toEqual([
            'broadcast',
            'recurring',
            'websocket',
            'http',
            'computer',
            'mcp',
            'fastify',
            'post-commit',
            'database',
        ]);
    } finally {
        await lifetime.dispose();
    }
});
