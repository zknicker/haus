import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { callMcpTool } from './tool-catalog.ts';
import { classifyMcpUpstreamError } from './upstream-failure.ts';

/**
 * A 2026-07-28 MCP server shaped like GitHub's: `owner` carries `x-mcp-header`, and a
 * `tools/call` without the matching `Mcp-Param-owner` header fails with JSON-RPC -32020.
 */
const requests = { calls: [] as (string | null)[], lists: 0 };
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
    server = Bun.serve({ fetch: handle, hostname: '127.0.0.1', port: 0 });
});
afterAll(async () => {
    await server.stop(true);
});

test('a cached client without a tools/list reproduces the GitHub header mismatch', async () => {
    await withClient(async (client) => {
        const failure = await client
            .callTool({ arguments: { owner: 'haus' }, name: 'read_repo' })
            .catch((cause: unknown) => cause);
        const classified = classifyMcpUpstreamError(failure, 'invocation');
        expect(classified).toMatchObject({ code: 'MCP_UNAVAILABLE', failureKind: 'protocol' });
        expect(classified.message).toBe(
            'The MCP invocation is unavailable: upstream JSON-RPC error -32020: header mismatch: missing Mcp-Param-owner header'
        );
    });
});

test('callMcpTool loads header bindings once per client before calling', async () => {
    await withClient(async (client) => {
        const before = requests.lists;
        const options = { signal: new AbortController().signal, timeout: 5000 };
        for (const owner of ['haus', 'grotto']) {
            const result = await callMcpTool(client, {
                arguments: { owner },
                name: 'read_repo',
                options,
            });
            expect(result.content).toEqual([{ text: `owner=${owner}`, type: 'text' }]);
        }
        expect(requests.lists - before).toBe(1);
        expect(requests.calls.slice(-2)).toEqual(['haus', 'grotto']);
    });
    await withClient(async (rebuilt) => {
        const before = requests.lists;
        await callMcpTool(rebuilt, {
            arguments: { owner: 'haus' },
            name: 'read_repo',
            options: { signal: new AbortController().signal, timeout: 5000 },
        });
        expect(requests.lists - before).toBe(1);
    });
});

async function withClient(use: (client: MCPClient) => Promise<void>) {
    const client = await createMCPClient({
        transport: { type: 'http', url: `http://127.0.0.1:${server.port}/mcp` },
    });
    try {
        await use(client);
    } finally {
        await client.close();
    }
}

async function handle(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response(null, { status: 405 });
    }
    const message = (await request.json()) as {
        id?: number;
        method: string;
        params?: { arguments?: { owner?: string } };
    };
    if (message.id === undefined) {
        return new Response(null, { status: 202 });
    }
    const reply = (result: Record<string, unknown>) =>
        Response.json({
            id: message.id,
            jsonrpc: '2.0',
            result: { resultType: 'complete', ...result },
        });
    if (message.method === 'server/discover') {
        return reply({
            _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'fixture', version: '1' } },
            capabilities: { tools: {} },
            supportedVersions: ['2026-07-28'],
        });
    }
    if (message.method === 'tools/list') {
        requests.lists += 1;
        return reply({ tools: [repoTool] });
    }
    if (message.method === 'tools/call') {
        const header = request.headers.get('mcp-param-owner');
        requests.calls.push(header);
        if (header !== message.params?.arguments?.owner) {
            return Response.json(
                {
                    error: {
                        code: -32_020,
                        message: 'header mismatch: missing Mcp-Param-owner header',
                    },
                    id: message.id,
                    jsonrpc: '2.0',
                },
                { status: 400 }
            );
        }
        return reply({ content: [{ text: `owner=${header}`, type: 'text' }] });
    }
    return Response.json({
        error: { code: -32_601, message: 'Method not found' },
        id: message.id,
        jsonrpc: '2.0',
    });
}

const repoTool = {
    description: 'Read a repository.',
    inputSchema: {
        properties: { owner: { type: 'string', 'x-mcp-header': 'owner' } },
        required: ['owner'],
        type: 'object',
    },
    name: 'read_repo',
};
