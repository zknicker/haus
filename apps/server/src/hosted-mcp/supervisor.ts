import { join } from 'node:path';
import {
    type EffectRuntime,
    instrumentOperation,
    settle,
    tracePromise,
    withTelemetrySpan,
} from '@haus/effect';
import { Data, Deferred, Effect, Schedule, type Scope } from 'effect';
import type { HostedMcpDefinition } from './catalog.ts';
import { type HostedMcpProcess, openHostedMcpProcess } from './process.ts';

class HostedMcpFailure extends Data.TaggedError('HostedMcpFailure')<{
    kind: 'startup' | 'readiness' | 'exit';
}> {}

type HostedMcpStatus = 'ready' | 'starting' | 'stopped';
interface HostedMcpEntry {
    process: HostedMcpProcess | null;
    restarts: number;
    status: HostedMcpStatus;
}
export interface HostedMcpAccess {
    health(): { id: string; status: HostedMcpStatus; restarts: number }[];
    request(id: string, path: string, init?: RequestInit): Promise<Response>;
}

export async function startHostedMcps(options: {
    definitions: readonly HostedMcpDefinition[];
    storageRoot: string;
    runtime: EffectRuntime<never>;
    scope: Scope.Scope;
}): Promise<HostedMcpAccess> {
    const entries = new Map<string, HostedMcpEntry>();
    for (const definition of options.definitions) {
        if (!/^[a-z][a-z0-9-]*$/u.test(definition.id) || entries.has(definition.id)) {
            throw new Error('Hosted MCP identifiers must be unique lowercase names.');
        }
        const entry: HostedMcpEntry = { process: null, status: 'starting', restarts: 0 };
        entries.set(definition.id, entry);
        const ready = await settle(options.runtime, Deferred.make<void, HostedMcpFailure>());
        await settle(
            options.runtime,
            Effect.forkIn(supervise(definition, entry, ready, options.storageRoot), options.scope)
        );
        await settle(options.runtime, Deferred.await(ready));
    }
    return {
        health: () =>
            [...entries].map(([id, entry]) => ({
                id,
                status: entry.status,
                restarts: entry.restarts,
            })),
        async request(id, path, init) {
            const entry = entries.get(id);
            if (!entry || entry.status !== 'ready' || !entry.process) {
                throw new Error('Hosted MCP is temporarily unavailable.');
            }
            const child = entry.process;
            return await tracePromise(
                options.runtime,
                'haus.hosted-mcp.request',
                {
                    'haus.operation':
                        path === '/mcp'
                            ? 'hosted-mcp.transport'
                            : init?.method === 'POST'
                              ? 'hosted-mcp.provision'
                              : 'hosted-mcp.revoke',
                    'haus.mcp.connector': id,
                },
                () => child.request(path, init),
                undefined,
                undefined,
                (response) => (response.ok ? 'success' : 'failure')
            );
        },
    };
}

function supervise(
    definition: HostedMcpDefinition,
    entry: HostedMcpEntry,
    ready: Deferred.Deferred<void, HostedMcpFailure>,
    storageRoot: string
) {
    const attempt = Effect.scoped(
        Effect.gen(function* () {
            entry.status = 'starting';
            const child = yield* Effect.acquireRelease(
                Effect.tryPromise({
                    catch: () => new HostedMcpFailure({ kind: 'startup' }),
                    try: () => openHostedMcpProcess(definition, join(storageRoot, definition.id)),
                }),
                (process) =>
                    Effect.promise(async () => {
                        entry.process = null;
                        entry.status = 'starting';
                        await process.stop();
                    })
            );
            yield* waitUntilReady(child).pipe(
                withTelemetrySpan('haus.hosted-mcp.lifecycle', {
                    'haus.operation': 'hosted-mcp.start',
                    'haus.mcp.connector': definition.id,
                })
            );
            entry.process = child;
            entry.status = 'ready';
            yield* Deferred.succeed(ready, undefined);
            yield* Effect.logInfo('Hosted MCP ready').pipe(
                Effect.annotateLogs({ connector: definition.id })
            );
            yield* Effect.raceFirst(
                Effect.promise(() => child.exited.catch(() => null)),
                Effect.sleep('5 seconds').pipe(
                    Effect.zipRight(
                        instrumentOperation(checkHealth(child), 'hosted-mcp.health').pipe(
                            Effect.repeat(Schedule.spaced('5 seconds'))
                        )
                    )
                )
            );
            return yield* Effect.fail(new HostedMcpFailure({ kind: 'exit' }));
        }).pipe(
            Effect.tapError((failure) =>
                Effect.logWarning('Hosted MCP stopped').pipe(
                    Effect.annotateLogs({ connector: definition.id, failure: failure.kind })
                )
            )
        )
    );
    return Effect.gen(function* () {
        for (;;) {
            const result = yield* Effect.exit(attempt);
            entry.process = null;
            entry.status = 'starting';
            if (result._tag === 'Failure' && !(yield* Deferred.isDone(ready))) {
                yield* Deferred.fail(ready, new HostedMcpFailure({ kind: 'startup' }));
                return;
            }
            entry.restarts += 1;
            yield* Effect.logWarning('Hosted MCP failed; restarting').pipe(
                Effect.annotateLogs({ connector: definition.id, restarts: entry.restarts })
            );
            yield* Effect.sleep(Math.min(30_000, 1000 * 2 ** Math.min(entry.restarts - 1, 5)));
        }
    }).pipe(
        Effect.ensuring(
            Effect.sync(() => {
                entry.process = null;
                entry.status = 'stopped';
            })
        )
    );
}

function checkHealth(child: HostedMcpProcess) {
    return Effect.tryPromise({
        catch: () => new HostedMcpFailure({ kind: 'readiness' }),
        try: async (signal) => {
            const response = await child.request('/healthz', { signal });
            const payload: unknown = await response.json();
            if (
                !response.ok ||
                typeof payload !== 'object' ||
                payload === null ||
                !('status' in payload) ||
                payload.status !== 'ok'
            ) {
                throw new Error('Hosted MCP is not ready.');
            }
        },
    }).pipe(
        Effect.timeoutFail({
            duration: '2 seconds',
            onTimeout: () => new HostedMcpFailure({ kind: 'readiness' }),
        })
    );
}

function waitUntilReady(child: HostedMcpProcess) {
    return Effect.raceFirst(
        checkHealth(child).pipe(
            Effect.retry(
                Schedule.spaced('250 millis').pipe(Schedule.intersect(Schedule.recurs(40)))
            ),
            Effect.timeoutFail({
                duration: '10 seconds',
                onTimeout: () => new HostedMcpFailure({ kind: 'readiness' }),
            })
        ),
        Effect.tryPromise({
            catch: () => new HostedMcpFailure({ kind: 'startup' }),
            try: async () => {
                await child.exited;
                throw new Error('Hosted MCP exited before readiness.');
            },
        })
    );
}
