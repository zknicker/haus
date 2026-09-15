import { afterAll, expect, test } from 'bun:test';
import type { MCPClient } from '@ai-sdk/mcp';
import * as Cause from 'effect/Cause';
import * as Option from 'effect/Option';
import * as Runtime from 'effect/Runtime';
import type { HausDatabase } from '../postgres/connection.ts';
import { makeServerRuntime } from '../server-runtime.ts';
import { McpDeniedError, McpUpstreamError } from './errors.ts';
import { McpRuntime } from './runtime.ts';
import { fakeQuery, grantDb, invoke, makeClient, tick } from './runtime-test-fixtures.ts';
import { modelToolName } from './tool-catalog.ts';

const effectRuntime = makeServerRuntime();

afterAll(async () => {
    await effectRuntime.dispose();
});

test('reuses one client and forwards signals through paginated discovery and invocation', async () => {
    const acquisition = Promise.withResolvers<MCPClient>();
    const { client, state } = makeClient('Fixture', {
        list: async (request) => ({
            tools: [{ description: 'Echo', inputSchema: {}, name: 'echo' }],
            ...(request?.params?.cursor ? {} : { nextCursor: 'page-2' }),
        }),
    });
    let starts = 0;
    const runtime = new McpRuntime(grantDb('connection-one', 'echo'), effectRuntime, {
        clientFactory: async () => {
            starts += 1;
            return await acquisition.promise;
        },
        discoveryTimeoutMs: 50,
        invocationTimeoutMs: 50,
    });
    const first = runtime.discover('connection-one');
    const second = runtime.discover('connection-one');
    await tick();
    expect(starts).toBe(1);
    acquisition.resolve(client);
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    await invoke(runtime, 'connection-one', { text: 'hello' });
    expect(state.listRequests).toHaveLength(4);
    expect(state.listRequests.every((request) => request?.options?.signal)).toBe(true);
    expect(state.listRequests.every((request) => request?.options?.timeout === 50)).toBe(true);
    expect(state.callRequests[0]?.options?.signal).toBeInstanceOf(AbortSignal);
    expect(state.callRequests[0]?.options?.timeout).toBe(50);
    await runtime.close();
    expect(state.closeCount).toBe(1);
});

test('isolates failed discovery while preserving healthy tool order', async () => {
    const slowList = Promise.withResolvers<unknown>();
    const first = makeClient('First');
    const slow = makeClient('Slow', {
        list: (request) => {
            request?.options?.signal?.addEventListener('abort', () => {
                slowList.reject(new Error('slow discovery aborted'));
            });
            return slowList.promise;
        },
    });
    const last = makeClient('Last');
    const clients = { first, slow, last };
    const runtime = new McpRuntime(
        {
            select: () =>
                fakeQuery([
                    { id: 'first', name: 'First', tools: ['echo'] },
                    { id: 'slow', name: 'Slow', tools: ['echo'] },
                    { id: 'last', name: 'Last', tools: ['echo'] },
                ]),
        } as unknown as HausDatabase,
        effectRuntime,
        {
            clientFactory: async (connectionId) =>
                clients[connectionId as keyof typeof clients].client,
            discoveryTimeoutMs: 15,
        }
    );
    const tools = await runtime.listAgentTools('server', 'agent');
    expect(tools.map((tool) => tool.description)).toEqual(['First: Echo', 'Last: Echo']);
    expect(tools.map((tool) => tool.name)).toEqual([
        modelToolName('first', 'echo'),
        modelToolName('last', 'echo'),
    ]);
    await runtime.close();
    expect(slow.state.closeCount).toBe(1);
    expect([first.state.closeCount, last.state.closeCount]).toEqual([1, 1]);
});

test('preserves denial, invalid arguments, auth, and unavailable errors', async () => {
    const denied = new McpRuntime(grantDb('denied', 'echo', false), effectRuntime, {
        clientFactory: async () => makeClient('Denied').client,
    });
    const denial = await invoke(denied, 'denied').catch((cause) => cause);
    expect(denial).toBeInstanceOf(McpDeniedError);
    expect(denial).toMatchObject({
        code: 'MCP_DENIED',
        message: 'Access to this MCP connection was revoked.',
    });

    const invalid = new McpRuntime(grantDb('invalid', 'echo'), effectRuntime, {
        clientFactory: async () => makeClient('Invalid').client,
    });
    await expect(invoke(invalid, 'invalid', [])).rejects.toMatchObject({
        code: 'MCP_UNAVAILABLE',
        message: 'The MCP invocation is unavailable.',
    });

    const auth = makeClient('Auth required', { list: async () => Promise.reject({ status: 401 }) });
    let authStarts = 0;
    const authRuntime = new McpRuntime({} as HausDatabase, effectRuntime, {
        clientFactory: async () => {
            authStarts += 1;
            if (authStarts === 1) {
                throw new Error('initialization failed');
            }
            return auth.client;
        },
    });
    await expect(authRuntime.discover('auth')).rejects.toMatchObject({
        code: 'MCP_UNAVAILABLE',
        message: 'The MCP discovery is unavailable.',
    });
    await expect(authRuntime.discover('auth')).rejects.toMatchObject({
        code: 'MCP_AUTH_REQUIRED',
        message: 'Reconnect this MCP connection before using it.',
    });
    expect(authStarts).toBe(2);

    const exactFailure = new McpUpstreamError('MCP_UNAVAILABLE', 'exact upstream failure');
    const exact = makeClient('Exact failure', {
        list: async () => Promise.reject(exactFailure),
    });
    const exactRuntime = new McpRuntime({} as HausDatabase, effectRuntime, {
        clientFactory: async () => exact.client,
    });
    await expect(exactRuntime.discover('exact')).rejects.toBe(exactFailure);
    await Promise.all([denied.close(), invalid.close(), authRuntime.close(), exactRuntime.close()]);
});

test('preserves an upstream classification defect Cause at the Promise seam', async () => {
    const defect = new Error('upstream classification defect');
    const foreignFailure = new Error('foreign upstream failure');
    Object.defineProperty(foreignFailure, 'statusCode', {
        get() {
            throw defect;
        },
    });
    const client = makeClient('Defective upstream', {
        list: async () => Promise.reject(foreignFailure),
    });
    const runtime = new McpRuntime({} as HausDatabase, effectRuntime, {
        clientFactory: async () => client.client,
    });

    const rejection = await runtime.discover('defective-upstream').catch((cause) => cause);
    expect(Runtime.isFiberFailure(rejection)).toBe(true);
    if (!Runtime.isFiberFailure(rejection)) {
        throw new Error('Expected an Effect FiberFailure.');
    }
    const retainedDefect = Cause.dieOption(rejection[Runtime.FiberFailureCauseId]);
    expect(Option.isSome(retainedDefect) ? retainedDefect.value : null).toBe(defect);
    await runtime.close();
});
