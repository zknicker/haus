import { afterEach, expect, test } from 'bun:test';
import * as z from 'zod';
import { defineHostTool, type HostToolSet } from './host-tool.ts';
import { type HostToolMcpDescriptor, startHostToolServer } from './mcp-server.ts';

let stop: (() => Promise<void>) | undefined;
let hang = Promise.withResolvers<AbortSignal>();
afterEach(async () => {
    await stop?.();
    stop = undefined;
    hang = Promise.withResolvers<AbortSignal>();
});
const toolsFor = (label: string): HostToolSet => [
    defineHostTool({
        description: `Echo for ${label}`,
        execute: async ({ value }) => ({ type: 'json', value: { label, value } }),
        inputSchema: z.object({ value: z.string() }).strict(),
        name: `echo_${label}`,
    }),
    defineHostTool({
        description: 'Large text',
        execute: async ({ size }) => ({ type: 'text', text: 'x'.repeat(size) }),
        inputSchema: z.object({ size: z.number().int() }).strict(),
        name: 'large',
    }),
    defineHostTool({
        description: 'Fails',
        execute: async () => {
            throw new Error('fixture failure');
        },
        inputSchema: z.object({}).strict(),
        name: 'fail',
    }),
    defineHostTool({
        description: 'Waits for cancellation',
        execute: async (_input, { signal }) => {
            hang.resolve(signal);
            await new Promise((resolve) => signal.addEventListener('abort', resolve));
            return { type: 'text', text: 'late' };
        },
        inputSchema: z.object({}).strict(),
        name: 'hang',
    }),
];

function client(mcp: HostToolMcpDescriptor, overrides: Record<string, string> = {}) {
    let session: string | null = null;
    let nextId = 1;
    const post = async (body: unknown) => {
        const response = await fetch(mcp.url, {
            body: JSON.stringify(body),
            headers: {
                ...mcp.headers,
                'content-type': 'application/json',
                ...(session ? { 'mcp-session-id': session } : {}),
                ...overrides,
            },
            method: 'POST',
        });
        session = response.headers.get('mcp-session-id') ?? session;
        return response;
    };
    return {
        notify: (method: string, params: unknown) => post({ jsonrpc: '2.0', method, params }),
        async request(method: string, params: unknown = {}, id: number | string = nextId++) {
            const response = await post({ id, jsonrpc: '2.0', method, params });
            return {
                body: (await response.json()) as Record<string, any>,
                status: response.status,
            };
        },
    };
}

test('serves per-session tools over MCP with isolation, errors, and large outputs', async () => {
    const server = startHostToolServer();
    stop = server.stop;
    const a = server.openSession(toolsFor('a'));
    const b = server.openSession(toolsFor('b'));
    expect(a.mcp).toMatchObject({ name: 'haus', transport: 'http' });
    expect(a.mcp.url).toBe(b.mcp.url);
    expect(a.mcp.headers.Authorization).not.toBe(b.mcp.headers.Authorization);

    const agentA = client(a.mcp);
    const init = await agentA.request('initialize', { protocolVersion: '2025-06-18' });
    expect(init.body.result).toMatchObject({
        capabilities: { tools: {} },
        protocolVersion: '2025-06-18',
        serverInfo: { name: 'haus' },
    });
    expect((await agentA.notify('notifications/initialized', {})).status).toBe(202);

    const listed = await agentA.request('tools/list');
    expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
        'echo_a',
        'large',
        'fail',
        'hang',
    ]);
    expect(listed.body.result.tools[0].inputSchema).toMatchObject({
        additionalProperties: false,
        properties: { value: { type: 'string' } },
        type: 'object',
    });

    const echoed = await agentA.request('tools/call', {
        arguments: { value: 'hi' },
        name: 'echo_a',
    });
    expect(echoed.body.result).toEqual({
        content: [{ text: '{"label":"a","value":"hi"}', type: 'text' }],
        structuredContent: { label: 'a', value: 'hi' },
    });
    const crossed = await agentA.request('tools/call', {
        arguments: { value: 'x' },
        name: 'echo_b',
    });
    expect(crossed.body.error).toMatchObject({ code: -32_602 });

    const failed = await agentA.request('tools/call', { arguments: {}, name: 'fail' });
    expect(failed.body.result).toEqual({
        content: [{ text: 'fixture failure', type: 'text' }],
        isError: true,
    });
    const invalid = await agentA.request('tools/call', { arguments: { value: 1 }, name: 'echo_a' });
    expect(invalid.body.result.isError).toBe(true);
    expect(invalid.body.result.content[0].text).toStartWith('Invalid arguments');

    const large = await agentA.request('tools/call', {
        arguments: { size: 8_000_000 },
        name: 'large',
    });
    expect(large.body.result.content[0].text.length).toBe(8_000_000);

    const agentB = client(b.mcp);
    await agentB.request('initialize');
    const bTools = await agentB.request('tools/list');
    expect(bTools.body.result.tools[0].name).toBe('echo_b');

    b.replaceTools([]);
    expect((await agentB.request('tools/list')).body.result.tools).toEqual([]);
});

test('rejects missing, wrong, and revoked tokens and unknown MCP sessions', async () => {
    const server = startHostToolServer({ name: 'host' });
    stop = server.stop;
    const session = server.openSession(toolsFor('a'));
    expect((await client(session.mcp, { Authorization: '' }).request('ping')).status).toBe(401);
    expect(
        (await client(session.mcp, { Authorization: 'Bearer wrong' }).request('ping')).status
    ).toBe(401);
    expect((await client(session.mcp, { 'mcp-session-id': 'forged' }).request('ping')).status).toBe(
        404
    );
    expect((await client(session.mcp).request('ping')).body.result).toEqual({});
    session.close();
    expect((await client(session.mcp).request('ping')).status).toBe(401);
});

test('cancels an in-flight call by notification while other calls proceed', async () => {
    const server = startHostToolServer();
    stop = server.stop;
    const session = server.openSession(toolsFor('a'));
    const agent = client(session.mcp);
    await agent.request('initialize');
    const pending = agent.request('tools/call', { arguments: {}, name: 'hang' }, 'hang-1');
    const signal = await hang.promise;
    const concurrent = await agent.request('tools/call', {
        arguments: { value: 'ok' },
        name: 'echo_a',
    });
    expect(concurrent.body.result.structuredContent).toEqual({ label: 'a', value: 'ok' });
    expect(signal.aborted).toBe(false);
    await agent.notify('notifications/cancelled', { requestId: 'hang-1' });
    expect(signal.aborted).toBe(true);
    expect((await pending).body.error).toEqual({ code: -32_800, message: 'Request cancelled' });
});

test('a dropped HTTP request and a closed session both abort in-flight calls', async () => {
    const server = startHostToolServer();
    stop = server.stop;
    const session = server.openSession(toolsFor('a'));
    const dropped = new AbortController();
    const request = fetch(session.mcp.url, {
        body: JSON.stringify({
            id: 1,
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { arguments: {}, name: 'hang' },
        }),
        headers: { ...session.mcp.headers, 'content-type': 'application/json' },
        method: 'POST',
        signal: dropped.signal,
    }).catch(() => undefined);
    const first = await hang.promise;
    dropped.abort();
    await request;
    await Bun.sleep(50);
    expect(first.aborted).toBe(true);

    hang = Promise.withResolvers<AbortSignal>();
    const pending = client(session.mcp).request('tools/call', { arguments: {}, name: 'hang' });
    const second = await hang.promise;
    session.close();
    expect(second.aborted).toBe(true);
    expect((await pending).body.error).toMatchObject({ code: -32_800 });
});
