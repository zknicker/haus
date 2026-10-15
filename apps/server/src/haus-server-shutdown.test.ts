import { expect, test } from 'bun:test';
import { type EffectRuntime, type LifecycleConsole, makeTestRuntime, settle } from '@haus/effect';
import { Cause, Effect, Exit, Layer, ManagedRuntime, Runtime, Scope, TestClock } from 'effect';
import {
    type HausServerShutdownOptions,
    type HausServerShutdownResources,
    makeHausServerShutdown,
} from './haus-server-shutdown.ts';

/** LIFO release order of the registered steps, as recorded by `recordingResources`. */
const closeOrder = [
    'broadcast',
    'recurring',
    'websocket',
    'http',
    'computer',
    'mcp-clients',
    'hosted-mcps',
    'fastify',
    'post-commit',
    'database',
];

test('drains recurring work before closing Server transports', async () => {
    const releaseRecurringWork = Promise.withResolvers<void>();
    const recurringStarted = Promise.withResolvers<void>();
    const events: string[] = [];
    const lifetime = await openShutdown(
        recordingResources(events, {
            closeRecurringWork: async () => {
                events.push('recurring-start');
                recurringStarted.resolve();
                await releaseRecurringWork.promise;
                events.push('recurring-end');
            },
        })
    );

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
            ...closeOrder.slice(2),
        ]);
    } finally {
        await lifetime.dispose();
    }
});

test('runs every finalizer after multiple failures and preserves the first one', async () => {
    const firstFailure = new Error('recurring close failed');
    const laterFailure = new Error('MCP close failed');
    const events: string[] = [];
    const lifetime = await openShutdown(
        recordingResources(events, {
            closeMcpClients: async () => {
                events.push('mcp-clients');
                throw laterFailure;
            },
            closeRecurringWork: async () => {
                events.push('recurring');
                throw firstFailure;
            },
        })
    );

    try {
        await expect(lifetime.close()).rejects.toBe(firstFailure);
        expect(events).toEqual(closeOrder);
    } finally {
        await lifetime.dispose();
    }
});

test('logs and skips a stuck step, then still runs every later step', async () => {
    const lines: string[] = [];
    const events: string[] = [];
    const lifetime = await openShutdown(
        recordingResources(events, {
            closeMcpClients: async () => {
                events.push('mcp-clients');
                throw new Error('MCP close failed');
            },
            closeRecurringWork: () => {
                events.push('recurring');
                return new Promise<void>(() => undefined);
            },
        }),
        { log: (line) => lines.push(line), stepTimeoutMs: 50 },
        ManagedRuntime.make(Layer.empty)
    );

    try {
        const startedAt = performance.now();
        await expect(lifetime.close()).rejects.toThrow(
            'Server shutdown step recurring-work still pending; skipped'
        );
        expect(performance.now() - startedAt).toBeLessThan(1000);
        expect(events).toEqual(closeOrder);
        expect(lines.map(maskDurations)).toEqual([
            '[haus] shutdown recurring-work failed after Nms: Server shutdown step recurring-work still pending; skipped',
            '[haus] shutdown mcp-clients failed after Nms: MCP close failed',
            '[haus] shutdown steps: reconnect-broadcast Nms, ' +
                'recurring-work failed after Nms: Server shutdown step recurring-work still pending; skipped, ' +
                'websocket-server Nms, http-connections Nms, computer-socket Nms, ' +
                'mcp-clients failed after Nms: MCP close failed, hosted-mcps Nms, ' +
                'fastify Nms, post-commit-work Nms, database Nms',
        ]);
    } finally {
        await lifetime.dispose();
    }
});

test('a stuck MCP client close is skipped at warning and hosted MCPs still stop', async () => {
    const events: string[] = [];
    const logged: string[] = [];
    const clientsStarted = Promise.withResolvers<void>();
    const lifetime = await openShutdown(
        recordingResources(events, {
            closeMcpClients: () => {
                events.push('mcp-clients');
                clientsStarted.resolve();
                return new Promise<void>(() => undefined);
            },
        }),
        {},
        makeTestRuntime({ output: recordingConsole(logged) })
    );

    try {
        // Bun's `rejects` drives the promise to settlement, so capture it instead.
        const closing = lifetime.close().then(
            () => null,
            (error: unknown) => error
        );
        await clientsStarted.promise;
        // The client step carries a 6s bound over its own 5s inner close timeout.
        await settle(lifetime.runtime, TestClock.adjust('5999 millis'));
        expect(events.at(-1)).toBe('mcp-clients');
        await settle(lifetime.runtime, TestClock.adjust('1 millis'));
        expect(await closing).toEqual(
            new Error('Server shutdown step mcp-clients still pending; skipped')
        );
        expect(events).toEqual(closeOrder);
        expect(logged).toEqual([
            'warn [haus] shutdown mcp-clients failed after Nms: Server shutdown step mcp-clients still pending; skipped',
            'info [haus] shutdown steps: reconnect-broadcast Nms, recurring-work Nms, ' +
                'websocket-server Nms, http-connections Nms, computer-socket Nms, ' +
                'mcp-clients failed after Nms: Server shutdown step mcp-clients still pending; skipped, ' +
                'hosted-mcps Nms, fastify Nms, post-commit-work Nms, database Nms',
        ]);
    } finally {
        await lifetime.dispose();
    }
});

test('preserves the full composite Scope Cause at the lifecycle settlement seam', async () => {
    const firstDefect = new Error('first scope defect');
    const laterDefect = new Error('later scope defect');
    const events: string[] = [];
    const lifetime = await openShutdown(recordingResources(events));

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
        expect(events).toEqual(closeOrder);
    } finally {
        await lifetime.dispose();
    }
});

async function openShutdown(
    resources: HausServerShutdownResources,
    options: HausServerShutdownOptions = { log: () => undefined },
    // Step bounds are wall-clock; the TestClock runtime fires them only when adjusted.
    runtime: EffectRuntime<never> = makeTestRuntime()
) {
    const scope = await settle(runtime, Scope.make());
    const shutdown = await settle(runtime, makeHausServerShutdown(options));
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

/** Each resource records one event in `closeOrder`; overrides replace single steps. */
function recordingResources(
    events: string[],
    overrides: Partial<HausServerShutdownResources> = {}
): HausServerShutdownResources {
    const record = (event: string) => () => {
        events.push(event);
    };
    const recordAsync = (event: string) => async () => {
        events.push(event);
    };
    return {
        broadcastReconnectNotification: record('broadcast'),
        closeComputerSocket: record('computer'),
        closeDatabase: recordAsync('database'),
        closeFastify: recordAsync('fastify'),
        closeHostedMcps: recordAsync('hosted-mcps'),
        closeHttpConnections: record('http'),
        closeMcpClients: recordAsync('mcp-clients'),
        closePostCommitWork: recordAsync('post-commit'),
        closeRecurringWork: recordAsync('recurring'),
        closeWebSocketServer: record('websocket'),
        ...overrides,
    };
}

/** Captures Effect log records as `<console method> <message>` with durations masked. */
function recordingConsole(logged: string[]): LifecycleConsole {
    const at =
        (method: string) =>
        (...values: readonly unknown[]) => {
            logged.push(maskDurations(`${method} ${values.join(' ')}`));
        };
    return {
        debug: at('debug'),
        error: at('error'),
        info: at('info'),
        log: at('log'),
        trace: at('trace'),
        warn: at('warn'),
    };
}

function maskDurations(line: string) {
    return line.replaceAll(/\d+ms/g, 'Nms');
}
