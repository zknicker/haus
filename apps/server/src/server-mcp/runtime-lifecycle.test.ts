import { afterAll, expect, test } from 'bun:test';
import type { HausDatabase } from '../postgres/connection.ts';
import { makeServerRuntime } from '../server-runtime.ts';
import { McpUpstreamError } from './errors.ts';
import { McpRuntime } from './runtime.ts';
import { fakeQuery, grantDb, invoke, makeClient, tick } from './runtime-test-fixtures.ts';
import { modelToolName } from './tool-catalog.ts';

const effectRuntime = makeServerRuntime();

afterAll(async () => {
    await effectRuntime.dispose();
});

test('timeouts abort active list and call requests and close their clients', async () => {
    const listGate = Promise.withResolvers<unknown>();
    let listAborted = false;
    const listed = makeClient('Slow list', {
        list: (request) => {
            request?.options?.signal?.addEventListener('abort', () => {
                listAborted = true;
            });
            return listGate.promise;
        },
    });
    const listRuntime = new McpRuntime({} as HausDatabase, effectRuntime, {
        clientFactory: async () => listed.client,
        discoveryTimeoutMs: 15,
    });
    await expect(listRuntime.discover('slow-list')).rejects.toMatchObject({
        code: 'MCP_TIMEOUT',
        message: 'The MCP discovery timed out.',
    });
    expect(listAborted).toBe(true);
    listGate.resolve({ tools: [] });
    await tick();
    expect(listed.state.closeCount).toBe(1);

    const callGate = Promise.withResolvers<unknown>();
    let callAborted = false;
    const called = makeClient('Slow call', {
        call: (request) => {
            request.options?.signal?.addEventListener('abort', () => {
                callAborted = true;
            });
            return callGate.promise;
        },
    });
    const callRuntime = new McpRuntime(grantDb('slow-call', 'echo'), effectRuntime, {
        clientFactory: async () => called.client,
        invocationTimeoutMs: 15,
    });
    await expect(invoke(callRuntime, 'slow-call')).rejects.toMatchObject({
        code: 'MCP_TIMEOUT',
        message: 'The MCP invocation timed out.',
    });
    expect(callAborted).toBe(true);
    callGate.resolve({ content: [] });
    await tick();
    expect(called.state.closeCount).toBe(1);
    await Promise.all([listRuntime.close(), callRuntime.close()]);
});

test('discovery timeout covers client acquisition and retires a late client', async () => {
    const acquisition = Promise.withResolvers<ReturnType<typeof makeClient>['client']>();
    const late = makeClient('Late acquisition');
    let factorySignal: AbortSignal | undefined;
    const runtime = new McpRuntime({} as HausDatabase, effectRuntime, {
        clientFactory: async (_connectionId, signal) => {
            factorySignal = signal;
            return await acquisition.promise;
        },
        discoveryTimeoutMs: 15,
    });

    const startedAt = Date.now();
    await expect(runtime.discover('slow-acquisition')).rejects.toMatchObject({
        code: 'MCP_TIMEOUT',
        message: 'The MCP discovery timed out.',
    });
    expect(Date.now() - startedAt).toBeLessThan(100);
    expect(factorySignal?.aborted).toBe(true);

    acquisition.resolve(late.client);
    await tick();
    expect(late.state.closeCount).toBe(1);
    await runtime.close();
    expect(late.state.closeCount).toBe(1);
});

async function closeActive(
    close: () => Promise<void>,
    pending: Promise<unknown>,
    started: Promise<void>,
    signal: () => AbortSignal | undefined,
    release: () => void,
    closeCount: () => number
) {
    await started;
    const startedAt = Date.now();
    const closing = close();
    const outcome = await Promise.race([
        pending,
        new Promise((resolve) => setTimeout(() => resolve('late'), 100)),
    ]);
    await closing;
    expect(Date.now() - startedAt).toBeLessThan(100);
    expect(outcome).toBeInstanceOf(McpUpstreamError);
    expect(outcome).toMatchObject({ code: 'MCP_UNAVAILABLE' });
    expect(signal()?.aborted).toBe(true);
    release();
    await tick();
    expect(closeCount()).toBe(1);
}

test('close interrupts active non-cooperative discovery and invocation', async () => {
    const listGate = Promise.withResolvers<unknown>();
    const listStarted = Promise.withResolvers<void>();
    let listSignal: AbortSignal | undefined;
    const listed = makeClient('Closing list', {
        list: (request) => {
            listSignal = request?.options?.signal;
            listStarted.resolve();
            return listGate.promise;
        },
    });
    const listRuntime = new McpRuntime({} as HausDatabase, effectRuntime, {
        clientFactory: async () => listed.client,
        closeTimeoutMs: 20,
    });
    await closeActive(
        () => listRuntime.closeConnection('closing-list'),
        listRuntime.discover('closing-list').catch((cause) => cause),
        listStarted.promise,
        () => listSignal,
        () => listGate.resolve({ tools: [] }),
        () => listed.state.closeCount
    );
    const callGate = Promise.withResolvers<unknown>();
    const callStarted = Promise.withResolvers<void>();
    let callSignal: AbortSignal | undefined;
    const called = makeClient('Closing call', {
        call: (request) => {
            callSignal = request.options?.signal;
            callStarted.resolve();
            return callGate.promise;
        },
    });
    const callRuntime = new McpRuntime(grantDb('closing-call', 'echo'), effectRuntime, {
        clientFactory: async () => called.client,
        closeTimeoutMs: 20,
    });
    await closeActive(
        () => callRuntime.close(),
        invoke(callRuntime, 'closing-call').catch((cause) => cause),
        callStarted.promise,
        () => callSignal,
        () => callGate.resolve({ content: [] }),
        () => called.state.closeCount
    );
});

test('one failed operation retires the client and interrupts its sibling', async () => {
    const hanging = Promise.withResolvers<unknown>();
    const firstStarted = Promise.withResolvers<void>();
    let firstSignal: AbortSignal | undefined;
    let calls = 0;
    const fixture = makeClient('Shared failure', {
        list: (request) => {
            calls += 1;
            if (calls === 1) {
                firstSignal = request?.options?.signal;
                firstStarted.resolve();
                return hanging.promise;
            }
            return Promise.reject(new Error('sibling failed'));
        },
    });
    const runtime = new McpRuntime({} as HausDatabase, effectRuntime, {
        clientFactory: async () => fixture.client,
        discoveryTimeoutMs: 1000,
    });
    const first = runtime.discover('shared').catch((cause) => cause);
    await firstStarted.promise;
    const failed = await runtime.discover('shared').catch((cause) => cause);
    const interrupted = await Promise.race([
        first,
        new Promise((resolve) => setTimeout(() => resolve('late'), 100)),
    ]);

    expect(failed).toBeInstanceOf(McpUpstreamError);
    expect(failed).toMatchObject({ code: 'MCP_UNAVAILABLE' });
    expect(interrupted).toBeInstanceOf(McpUpstreamError);
    expect(interrupted).toMatchObject({ code: 'MCP_UNAVAILABLE' });
    expect(firstSignal?.aborted).toBe(true);
    hanging.resolve({ tools: [] });
    await tick();
    expect(fixture.state.closeCount).toBe(1);
    await runtime.close();
    expect(fixture.state.closeCount).toBe(1);
});

test('caller cancellation aborts one invocation without retiring its shared MCP client', async () => {
    const started = Promise.withResolvers<void>();
    let calls = 0;
    const fixture = makeClient('Shared caller cancellation', {
        call: async (request) => {
            if (++calls > 1) {
                return { content: [] };
            }
            started.resolve();
            return await new Promise((_resolve, reject) =>
                request.options?.signal?.addEventListener(
                    'abort',
                    () => reject(new Error('cancelled')),
                    { once: true }
                )
            );
        },
    });
    const db = {
        select: () =>
            fakeQuery([{ id: 'shared', name: 'Shared', tools: ['echo'], connectionId: 'shared' }]),
    } as unknown as HausDatabase;
    const runtime = new McpRuntime(db, effectRuntime, {
        clientFactory: async () => fixture.client,
    });
    const controller = new AbortController();
    const pending = runtime
        .invoke({
            agentId: 'agent-one',
            serverId: 'server-one',
            toolName: modelToolName('shared', 'echo'),
            args: {},
            signal: controller.signal,
        })
        .catch((error) => error);
    await started.promise;
    controller.abort();
    await pending;
    expect(fixture.state.closeCount).toBe(0);
    expect(await invoke(runtime, 'shared')).toEqual({ content: [] });
    expect(fixture.state.closeCount).toBe(0);
    await runtime.close();
});
