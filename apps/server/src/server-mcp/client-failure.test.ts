import { afterAll, expect, test } from 'bun:test';
import { type MCPClient, UnauthorizedError } from '@ai-sdk/mcp';
import { makeServerRuntime } from '../server-runtime.ts';
import { McpClientCache } from './client-cache.ts';
import { classifyMcpClientFailure } from './client-failure.ts';
import { McpUpstreamError } from './errors.ts';
import { runMcpUpstream } from './upstream-operation.ts';

const effectRuntime = makeServerRuntime();

afterAll(async () => {
    await effectRuntime.dispose();
});

type ListTools = (signal: AbortSignal) => Promise<unknown>;

function makeHarness(list: ListTools) {
    const state = { closeCount: 0, starts: 0 };
    const cache = new McpClientCache(effectRuntime, () => {
        state.starts += 1;
        const client = {
            close: () => {
                state.closeCount += 1;
                return Promise.resolve();
            },
            listTools: (request: { options: { signal: AbortSignal } }) =>
                list(request.options.signal),
        } as unknown as MCPClient;
        return Promise.resolve(client);
    });
    const call = (timeoutMs = 1000) =>
        runMcpUpstream({
            clients: cache,
            connectionId: 'connection',
            operation: 'invocation',
            timeoutMs,
            use: (client, signal): Promise<unknown> => client.listTools({ options: { signal } }),
        });
    return { cache, call, state };
}

/** Mirrors `MCPClientError` from @ai-sdk/mcp, which the package does not export. */
function mcpClientError(message: string, fields: { code?: number; statusCode?: number } = {}) {
    return Object.assign(new Error(message), {
        ...fields,
        [Symbol.for('vercel.ai.error.AI_MCPClientError')]: true,
    });
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test('a per-call timeout cancels only that call and keeps the shared client', async () => {
    const sibling = Promise.withResolvers<unknown>();
    let calls = 0;
    let timedOutSignal: AbortSignal | undefined;
    let siblingSignal: AbortSignal | undefined;
    const { cache, call, state } = makeHarness((signal) => {
        calls += 1;
        if (calls === 1) {
            timedOutSignal = signal;
            return new Promise(() => undefined);
        }
        if (calls === 2) {
            siblingSignal = signal;
            return sibling.promise;
        }
        return Promise.resolve({ tools: [] });
    });

    const slow = call(20).catch((cause) => cause);
    const concurrent = call();
    const timedOut = await slow;
    expect(timedOut).toBeInstanceOf(McpUpstreamError);
    expect((timedOut as McpUpstreamError).code).toBe('MCP_TIMEOUT');
    expect(timedOutSignal?.aborted).toBe(true);
    await tick();
    expect(siblingSignal?.aborted).toBe(false);

    sibling.resolve({ tools: ['sibling'] });
    await expect(concurrent).resolves.toEqual({ tools: ['sibling'] });
    await expect(call()).resolves.toEqual({ tools: [] });
    expect(state.starts).toBe(1);
    expect(state.closeCount).toBe(0);
    await cache.closeAll(20);
    expect(state.closeCount).toBe(1);
});

test('a session failure rebuilds the client after in-flight siblings finish', async () => {
    const sibling = Promise.withResolvers<unknown>();
    let calls = 0;
    let siblingSignal: AbortSignal | undefined;
    const { cache, call, state } = makeHarness((signal) => {
        calls += 1;
        if (calls === 1) {
            siblingSignal = signal;
            return sibling.promise;
        }
        if (calls === 2) {
            return Promise.reject(mcpClientError('session expired', { statusCode: 404 }));
        }
        return Promise.resolve({ tools: [] });
    });

    const concurrent = call();
    await tick();
    const failed = await call().catch((cause) => cause);
    expect((failed as McpUpstreamError).code).toBe('MCP_UNAVAILABLE');
    await expect(call()).resolves.toEqual({ tools: [] });
    expect(state.starts).toBe(2);
    expect(siblingSignal?.aborted).toBe(false);
    expect(state.closeCount).toBe(0);

    sibling.resolve({ tools: ['sibling'] });
    await expect(concurrent).resolves.toEqual({ tools: ['sibling'] });
    await tick();
    expect(state.closeCount).toBe(1);
    await cache.closeAll(20);
    expect(state.closeCount).toBe(2);
});

test('an auth failure still discards the client and the next call rebuilds', async () => {
    let calls = 0;
    const { cache, call, state } = makeHarness(() => {
        calls += 1;
        return calls === 1
            ? Promise.reject(mcpClientError('unauthorized', { statusCode: 401 }))
            : Promise.resolve({ tools: [] });
    });
    const failed = await call().catch((cause) => cause);
    expect((failed as McpUpstreamError).code).toBe('MCP_AUTH_REQUIRED');
    await tick();
    expect(state.closeCount).toBe(1);
    await expect(call()).resolves.toEqual({ tools: [] });
    expect(state.starts).toBe(2);
    await cache.closeAll(20);
});

test('classifies @ai-sdk/mcp failures by the scope they break', () => {
    const operation = [
        mcpClientError('Method not found', { code: -32_601 }),
        mcpClientError('Request timed out after 30000ms'),
        mcpClientError('Request was aborted'),
        mcpClientError('Failed to parse server response'),
        mcpClientError('MCP HTTP Transport Error', { statusCode: 500 }),
        new McpUpstreamError('MCP_TIMEOUT', 'The MCP invocation timed out.'),
    ];
    const session = [
        mcpClientError('Connection closed'),
        mcpClientError('Attempted to send a request from a closed client'),
        mcpClientError('MCP HTTP Transport Error', { statusCode: 404 }),
        mcpClientError('MCP HTTP Transport Error', { statusCode: 403 }),
        new UnauthorizedError(),
        new TypeError('fetch failed'),
        new McpUpstreamError('MCP_AUTH_REQUIRED', 'Reconnect.'),
        new McpUpstreamError('MCP_UNAVAILABLE', 'Unavailable.', {
            cause: mcpClientError('Connection closed'),
        }),
    ];
    for (const cause of operation) {
        expect(classifyMcpClientFailure(cause)).toBe('operation');
    }
    for (const cause of session) {
        expect(classifyMcpClientFailure(cause)).toBe('session');
    }
});
