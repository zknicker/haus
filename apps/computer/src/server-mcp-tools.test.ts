import { afterEach, expect, test } from 'bun:test';
import type { ToolSet } from '@ai-sdk/provider-utils';
import { createServerMcpTools } from './server-mcp-tools.ts';

let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => {
    server?.stop(true);
});

const definition = {
    description: 'Weather for a city',
    inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
    name: 'mcp__fixture__weather',
    title: 'Weather',
};
const call = (tools: ToolSet, code: string, abortSignal?: AbortSignal) =>
    tools.execute?.execute?.(
        { code },
        {
            abortSignal,
            context: undefined,
            messages: [],
            toolCallId: 'executor-test',
        }
    );

test('fixed tool reads changing grants at dispatch and binds authority outside model code', async () => {
    let granted = false;
    let requests = 0;
    let invocations = 0;
    server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        async fetch(request) {
            requests += 1;
            const allowed = granted && request.headers.get('authorization') === 'Bearer agent-a';
            if (new URL(request.url).pathname.endsWith('/tools')) {
                return Response.json({
                    tools: allowed ? [definition] : [],
                    total: allowed ? 1 : 0,
                });
            }
            if (!allowed) {
                return Response.json(
                    { code: 'MCP_DENIED', message: 'Access was revoked.' },
                    { status: 403 }
                );
            }
            invocations += 1;
            granted = false;
            return Response.json({ result: { verification: 'fixture-42' } });
        },
    });
    const proxyUrl = `http://127.0.0.1:${server.port}`;
    const a = createServerMcpTools({ proxyUrl, proxyToken: 'agent-a' });
    const b = createServerMcpTools({ proxyUrl, proxyToken: 'agent-b' });
    expect(Object.keys(a)).toEqual(['execute']);
    expect(requests).toBe(0);
    expect(await call(a, 'return await tools.search({query:"weather"});')).toMatchObject({
        result: { tools: [], total: 0 },
    });
    granted = true;
    expect(await call(a, 'return await tools.search({query:"weather"});')).toMatchObject({
        result: { tools: [{ name: definition.name }], total: 1 },
    });
    expect(
        await call(a, `return await tools.describe({name:"${definition.name}"});`)
    ).toMatchObject({ result: { inputSchema: definition.inputSchema } });
    expect(
        await call(b, `return await tools.call({name:"${definition.name}",args:{city:"Paris"}});`)
    ).toMatchObject({ result: { error: { code: 'MCP_DENIED' } } });
    expect(
        await call(b, 'return await tools.search({query:"weather",agentId:"agent-a"});')
    ).toMatchObject({ result: { error: { code: 'INVALID_ARGUMENTS' } } });
    expect(
        await call(
            a,
            `const first = await tools.call({name:"${definition.name}",args:{city:"Paris"}}); const second = await tools.call({name:"${definition.name}",args:{city:"Paris"}}); return {first,second};`
        )
    ).toMatchObject({
        result: {
            first: { verification: 'fixture-42' },
            second: { error: { code: 'MCP_DENIED' } },
        },
    });
    expect(invocations).toBe(1);
    expect(
        await call(a, `return await tools.describe({name:"${definition.name}"});`)
    ).toMatchObject({ result: { error: { code: 'MCP_DENIED' } } });
    granted = true;
    expect(
        await call(a, `return await tools.call({name:"${definition.name}",args:{city:"Paris"}});`)
    ).toMatchObject({ result: { verification: 'fixture-42' } });
    expect(Object.keys(a)).toEqual(['execute']);
}, 15_000);

test('preserves Server MCP error codes inside Executor results', async () => {
    let code = 'MCP_DENIED';
    server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: () => Response.json({ code, message: 'Fixture failure.' }, { status: 502 }),
    });
    const tools = createServerMcpTools({
        proxyUrl: `http://127.0.0.1:${server.port}`,
        proxyToken: 'fixture',
    });
    for (code of ['MCP_DENIED', 'MCP_TIMEOUT', 'MCP_AUTH_REQUIRED', 'MCP_UNAVAILABLE']) {
        expect(
            await call(tools, 'return await tools.call({name:"fixture",args:{}});')
        ).toMatchObject({ result: { error: { code } } });
    }
});

test('stopping Executor cancels its exact HTTP invocation before returning', async () => {
    const started = Promise.withResolvers<string>();
    const stopped = Promise.withResolvers<void>();
    const cancelled: string[] = [];
    let invocations = 0;
    server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        async fetch(request) {
            expect(request.headers.get('authorization')).toBe('Bearer fixture');
            if (new URL(request.url).pathname.endsWith('/cancel')) {
                const body = (await request.json()) as { requestId: string };
                cancelled.push(body.requestId);
                stopped.resolve();
                return Response.json({ cancelled: true });
            }
            invocations += 1;
            started.resolve(request.headers.get('x-haus-mcp-request-id') ?? '');
            await stopped.promise;
            return Response.json({ result: null });
        },
    });
    const tools = createServerMcpTools({
        proxyUrl: `http://127.0.0.1:${server.port}`,
        proxyToken: 'fixture',
    });
    const controller = new AbortController();
    const execution = call(
        tools,
        'await tools.call({name:"hang",args:{}}); return await tools.call({name:"late",args:{}});',
        controller.signal
    );
    const rejection = Promise.resolve(execution).catch((cause: unknown) => cause);
    const requestId = await started.promise;
    controller.abort();
    expect(await rejection).toBeInstanceOf(Error);
    expect(requestId).not.toBe('');
    expect(cancelled).toEqual([requestId]);
    expect(invocations).toBe(1);
});
