import { afterAll, beforeAll } from 'bun:test';
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { type Observer, observable } from '@trpc/server/observable';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { subscriptionRestartDelayMs } from '../hooks/realtime/subscription-restart.ts';
import { hausTrpc } from '../lib/haus-server.tsx';
import { HausSessionRefreshContext } from '../lib/haus-session-context.ts';
import { queryClientDefaultOptions } from '../lib/query-policy.ts';
import { targetedReadCoalescer } from '../lib/targeted-read-coalescer.ts';
import { installFakeDom } from './fake-dom.ts';

/** One subscription the App opened over the fake socket. */
export interface OpenStream {
    closed: boolean;
    input: Record<string, unknown>;
    observer: Observer<unknown, unknown>;
    path: string;
}

/** A cache operation a stream hook asked the coalescer for. */
export type CacheOp =
    | { op: 'invalidate'; exact: boolean; queryKey: QueryKey }
    | { op: 'noteMessageAnnotated'; target: unknown }
    | { op: 'noteMessageCreated'; event: unknown }
    | { op: 'noteTaskLabelUpdated'; event: unknown }
    | { op: 'purgeChat'; scope: unknown }
    | { op: 'purgeServer'; scope: unknown }
    | { op: 'recoverTranscriptLists'; scope: unknown };

const heldRestarts = new Map<number, () => void>();
const restartBackoffs = new Set(
    [0, 1, 2, 3, 4, 5].map((attempt) => subscriptionRestartDelayMs(attempt))
);

/** A subscription restart's backoff, never a React Query gc or retry timer. */
function isRestartBackoff(delayMs: number | undefined) {
    return delayMs !== undefined && restartBackoffs.has(delayMs);
}
let nextHeld = 1_000_000;

/**
 * Fake DOM for mounting stream hooks under `bun test`, plus held restart
 * timers: a `setTimeout` of a second or more (a subscription restart's
 * backoff) waits for `runRestarts()` instead of real time. Call at module top.
 */
export function installRealtimeTestDom() {
    let restore: () => void = () => undefined;
    const scope = globalThis as {
        clearTimeout: typeof clearTimeout;
        setTimeout: typeof setTimeout;
    };
    const realSetTimeout = scope.setTimeout;
    const realClearTimeout = scope.clearTimeout;
    const realWarn = console.warn;
    beforeAll(() => {
        heldRestarts.clear();
        restore = installFakeDom();
        // Restart reports are expected here; tests assert the behavior instead.
        console.warn = () => undefined;
        scope.setTimeout = ((run: () => void, delayMs?: number) => {
            if (isRestartBackoff(delayMs)) {
                nextHeld += 1;
                heldRestarts.set(nextHeld, run);
                return nextHeld as unknown as ReturnType<typeof setTimeout>;
            }
            return realSetTimeout(run, delayMs);
        }) as typeof setTimeout;
        scope.clearTimeout = ((handle: unknown) => {
            if (!heldRestarts.delete(handle as number)) {
                realClearTimeout(handle as ReturnType<typeof setTimeout>);
            }
        }) as typeof clearTimeout;
    });
    afterAll(() => {
        scope.setTimeout = realSetTimeout;
        scope.clearTimeout = realClearTimeout;
        console.warn = realWarn;
        restore();
    });
}

/** Runs every held restart now, as if its backoff elapsed. */
export function runRestarts() {
    const due = [...heldRestarts.values()];
    heldRestarts.clear();
    React.act(() => {
        for (const run of due) {
            run();
        }
    });
    return due.length;
}

/**
 * A real QueryClient and tRPC client over a fake transport: every
 * subscription is recorded and driven by the test (start, data, error,
 * completion), every query is answered by `answer`, and every coalescer call
 * is recorded instead of run, so a test asserts a hook's exact cache ops.
 */
export function createRealtimeHarness(answer: (path: string) => unknown = () => null) {
    const queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions });
    const streams: OpenStream[] = [];
    const reads: string[] = [];
    const ops: CacheOp[] = [];
    let sessionRefreshes = 0;
    const client = hausTrpc.createClient({
        links: [
            () =>
                ({ op }) =>
                    observable((observer) => {
                        if (op.type === 'subscription') {
                            const stream: OpenStream = {
                                closed: false,
                                input: op.input as Record<string, unknown>,
                                observer: observer as Observer<unknown, unknown>,
                                path: op.path,
                            };
                            streams.push(stream);
                            return () => {
                                stream.closed = true;
                            };
                        }
                        reads.push(op.path);
                        observer.next({ result: { data: answer(op.path) } });
                        observer.complete();
                        return () => undefined;
                    }),
        ],
    });
    const coalescer = targetedReadCoalescer(queryClient, client);
    Object.assign(coalescer, {
        invalidate: ({ exact = false, queryKey }: { exact?: boolean; queryKey: QueryKey }) =>
            ops.push({ exact, op: 'invalidate', queryKey }),
        noteMessageAnnotated: (target: unknown) => ops.push({ op: 'noteMessageAnnotated', target }),
        noteMessageCreated: (event: unknown) => ops.push({ event, op: 'noteMessageCreated' }),
        noteTaskLabelUpdated: async (event: unknown) => {
            ops.push({ event, op: 'noteTaskLabelUpdated' });
        },
        purgeChat: async (scope: unknown) => {
            ops.push({ op: 'purgeChat', scope });
        },
        purgeServer: async (scope: unknown) => {
            ops.push({ op: 'purgeServer', scope });
        },
        recoverTranscriptLists: (scope: unknown) =>
            ops.push({ op: 'recoverTranscriptLists', scope }),
    });

    const live = (path: string) => {
        const stream = [...streams]
            .reverse()
            .find((candidate) => candidate.path === path && !candidate.closed);
        if (!stream) {
            throw new Error(`No open ${path} subscription.`);
        }
        return stream;
    };
    const { act } = React;

    const refusal = (code: string, hausRefusal?: string) =>
        TRPCClientError.from({
            error: { code: -32_000, data: { code, hausRefusal }, message: code },
        });

    return {
        act,
        client,
        /** A tRPC error as a stream sees it, with an optional `hausRefusal`. */
        refusal,
        /** The stream ended normally. */
        complete: (path: string) => act(() => live(path).observer.complete()),
        /** Delivers one live event. */
        emit: (path: string, data: unknown) =>
            act(() => live(path).observer.next({ result: { data, type: 'data' } })),
        /** Ends the stream with a tRPC error carrying `code` and an optional `hausRefusal`. */
        fail: (path: string, code: string, hausRefusal?: string) =>
            act(() => live(path).observer.error(refusal(code, hausRefusal))),
        /** Live (not closed) subscriptions, by procedure path. */
        openPaths: () =>
            streams
                .filter((stream) => !stream.closed)
                .map((stream) => stream.path)
                .sort(),
        ops,
        queryClient,
        reads,
        sessionRefreshes: () => sessionRefreshes,
        /** The server acknowledged the stream's start. */
        start: (path: string) =>
            act(() => live(path).observer.next({ result: { type: 'started' } })),
        streams,
        async mount(node: React.ReactNode) {
            const { createRoot } = await import('react-dom/client');
            const container = document.createElement('div');
            let root: Root | null = null;
            const refresh = async () => {
                sessionRefreshes += 1;
                return true;
            };
            const render = (next: React.ReactNode) =>
                act(() => {
                    root ??= createRoot(container);
                    root.render(
                        <HausSessionRefreshContext value={refresh}>
                            <QueryClientProvider client={queryClient}>
                                <hausTrpc.Provider client={client} queryClient={queryClient}>
                                    {next}
                                </hausTrpc.Provider>
                            </QueryClientProvider>
                        </HausSessionRefreshContext>
                    );
                });
            await render(node);
            return { render, unmount: () => act(() => root?.unmount()) };
        },
    };
}

/** A recorded invalidation's procedure path and input, for readable assertions. */
export function invalidated(ops: readonly CacheOp[]) {
    return ops.flatMap((entry) => {
        if (entry.op !== 'invalidate') {
            return [];
        }
        const [path, options] = entry.queryKey as [string[], { input?: unknown } | undefined];
        return [{ input: options?.input, path: path.join('.') }];
    });
}
