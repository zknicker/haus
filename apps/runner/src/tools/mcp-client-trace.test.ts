import { afterAll, expect, test } from 'bun:test';
import { createMcpClient } from './mcp-client.ts';

const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
const received: Array<string | null> = [];
const server = Bun.serve({
    fetch(request) {
        received.push(request.headers.get('traceparent'));
        return Response.json({ tools: [], total: 0 });
    },
    hostname: '127.0.0.1',
    port: 0,
});

afterAll(() => {
    server.stop(true);
});

const authority = {
    agentId: 'agt_trace',
    runCredential: 'run-credential-trace',
    runId: 'run_trace',
    serverUrl: `http://127.0.0.1:${server.port}`,
};

test('an MCP call carries the dispatch trace the Server started the run under', async () => {
    received.length = 0;
    const client = createMcpClient({ ...authority, traceparent });

    await client.search('issues', new AbortController().signal);

    expect(received).toEqual([traceparent]);
});

test('a run without a dispatch trace sends no trace header', async () => {
    received.length = 0;
    const client = createMcpClient(authority);

    await client.search('issues', new AbortController().signal);

    expect(received).toEqual([null]);
});
