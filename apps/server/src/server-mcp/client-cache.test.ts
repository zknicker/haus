import { afterAll, expect, test } from 'bun:test';
import type { Client as MCPClient } from '@modelcontextprotocol/client';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Runtime from 'effect/Runtime';
import { makeServerRuntime } from '../server-runtime.ts';
import { McpClientCache } from './client-cache.ts';
import { McpClientAcquireError } from './errors.ts';

const effectRuntime = makeServerRuntime();

afterAll(async () => {
    await effectRuntime.dispose();
});

interface ListRequest {
    options?: { signal?: AbortSignal };
}
interface ClientPlan {
    close?: () => Promise<void>;
    list?: (request: ListRequest) => Promise<unknown>;
}
function makeClient(plan: ClientPlan = {}) {
    const state = { closeCount: 0 };
    const client = {
        close: () => {
            state.closeCount += 1;
            return plan.close?.() ?? Promise.resolve();
        },
        listTools: (_params: unknown, options?: ListRequest['options']) =>
            plan.list?.({ options }) ?? Promise.resolve({ tools: [] }),
    } as unknown as MCPClient;
    return { client, state };
}
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test('single-flights acquisition and retries a failed entry after close', async () => {
    const opening = Promise.withResolvers<MCPClient>();
    const first = makeClient();
    const second = makeClient();
    let starts = 0;
    const cache = new McpClientCache(effectRuntime, async () => {
        starts += 1;
        return starts === 1 ? await opening.promise : second.client;
    });
    const firstRun = cache.run('connection', (client) => client);
    const concurrentRun = cache.run('connection', (client) => client);
    await tick();
    expect(starts).toBe(1);
    opening.resolve(first.client);
    await expect(Promise.all([firstRun, concurrentRun])).resolves.toEqual([
        first.client,
        first.client,
    ]);
    await cache.closeConnection('connection', 20);
    expect(first.state.closeCount).toBe(1);

    await expect(cache.run('connection', (client) => client)).resolves.toBe(second.client);
    expect(starts).toBe(2);
    await cache.closeAll(20);
    expect(second.state.closeCount).toBe(1);

    let attempts = 0;
    const retryClient = makeClient();
    const factoryFailure = new Error('factory failed');
    const failed = new McpClientCache(effectRuntime, async () => {
        attempts += 1;
        if (attempts === 1) {
            throw factoryFailure;
        }
        return retryClient.client;
    });
    const rejection = await failed.run('retry', (client) => client).catch((cause) => cause);
    expect(rejection).toBeInstanceOf(McpClientAcquireError);
    if (!(rejection instanceof McpClientAcquireError)) {
        throw new Error('Expected a typed MCP client acquisition error.');
    }
    expect(rejection.cause).toBe(factoryFailure);
    await tick();
    await expect(failed.run('retry', (client) => client)).resolves.toBe(retryClient.client);
    await failed.closeAll(20);
    expect(retryClient.state.closeCount).toBe(1);
});

test('retirement aborts active operations and rejects late completion', async () => {
    const request = Promise.withResolvers<unknown>();
    let aborted = false;
    const { client, state } = makeClient({
        list: (options) => {
            options.options?.signal?.addEventListener('abort', () => {
                aborted = true;
            });
            return request.promise;
        },
    });
    const cache = new McpClientCache(effectRuntime, async () => client);
    const running = cache.run('active', (ready) =>
        ready.pipe(
            Effect.flatMap((client) =>
                Effect.tryPromise({
                    try: (signal) => client.listTools(undefined, { signal }),
                    catch: (cause) => cause,
                })
            )
        )
    );
    await tick();
    await cache.closeConnection('active', 20);
    expect(aborted).toBe(true);
    expect(state.closeCount).toBe(1);
    request.resolve({ tools: [] });
    await expect(running).rejects.toBeDefined();
    await cache.closeConnection('active', 20);
    await cache.closeAll(20);
    expect(state.closeCount).toBe(1);
});

test('closes a ready client once after a failed operation', async () => {
    const { client, state } = makeClient({
        list: async () => Promise.reject(new Error('operation failed')),
    });
    const cache = new McpClientCache(effectRuntime, async () => client);
    const failed = cache.run('failed-operation', (ready) =>
        ready.pipe(
            Effect.flatMap((client) =>
                Effect.tryPromise({
                    try: (signal) => client.listTools(undefined, { signal }),
                    catch: (cause) => cause,
                })
            )
        )
    );
    await expect(failed).rejects.toThrow('operation failed');
    await tick();
    expect(state.closeCount).toBe(1);
    await cache.closeAll(20);
    expect(state.closeCount).toBe(1);
});

test('does not reuse a late factory client after reacquisition', async () => {
    const opening = Promise.withResolvers<MCPClient>();
    const late = makeClient();
    const replacement = makeClient();
    let starts = 0;
    let factorySignal: AbortSignal | undefined;
    const cache = new McpClientCache(effectRuntime, async (_id, signal) => {
        starts += 1;
        factorySignal = signal;
        return starts === 1 ? await opening.promise : replacement.client;
    });
    const lateRun = cache.run('late', (client) => client);
    const lateOutcome = lateRun.catch((cause) => cause);
    await tick();
    const started = Date.now();
    await cache.closeConnection('late', 10);
    expect(Date.now() - started).toBeLessThan(100);
    expect(factorySignal?.aborted).toBe(true);
    opening.resolve(late.client);
    await expect(lateOutcome).resolves.toBeInstanceOf(Error);
    await tick();
    expect(late.state.closeCount).toBe(1);
    await expect(cache.run('late', (client) => client)).resolves.toBe(replacement.client);
    await cache.closeAll(20);
    expect(late.state.closeCount).toBe(1);
    expect(replacement.state.closeCount).toBe(1);
    await cache.closeAll(20);
    expect(replacement.state.closeCount).toBe(1);
});

test('bounds a hanging concrete close while observing eventual settlement', async () => {
    const closing = Promise.withResolvers<void>();
    const client = makeClient({ close: () => closing.promise });
    const cache = new McpClientCache(effectRuntime, async () => client.client);
    await expect(cache.run('closing', (ready) => ready)).resolves.toBe(client.client);
    const started = Date.now();
    await cache.closeAll(10);
    expect(Date.now() - started).toBeLessThan(100);
    expect(client.state.closeCount).toBe(1);
    closing.resolve();
    await tick();
    await cache.closeAll(20);
    expect(client.state.closeCount).toBe(1);

    const rejected = makeClient({ close: async () => Promise.reject(new Error('close failed')) });
    const rejectedCache = new McpClientCache(effectRuntime, async () => rejected.client);
    await expect(rejectedCache.run('rejected', (ready) => ready)).resolves.toBe(rejected.client);
    await rejectedCache.closeAll(20);
    expect(rejected.state.closeCount).toBe(1);
});

test('preserves a composite Cause when an operation fails and its finalizer defects', async () => {
    const expectedFailure = new Error('operation failed');
    const defect = new Error('finalizer defect');
    const cache = new McpClientCache(effectRuntime, async () => makeClient().client);

    const rejection = await cache
        .run('composite', (ready) =>
            ready.pipe(
                Effect.andThen(Effect.fail(expectedFailure)),
                Effect.ensuring(Effect.die(defect))
            )
        )
        .catch((cause) => cause);

    expect(Runtime.isFiberFailure(rejection)).toBe(true);
    if (!Runtime.isFiberFailure(rejection)) {
        throw new Error('Expected an Effect FiberFailure.');
    }
    const retainedDefect = Cause.dieOption(rejection[Runtime.FiberFailureCauseId]);
    expect(Option.isSome(retainedDefect) ? retainedDefect.value : null).toBe(defect);
    await cache.closeAll(20);
});
