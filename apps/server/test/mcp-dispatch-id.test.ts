import { afterAll, beforeAll, expect, test } from 'bun:test';
import { modelToolName } from '../src/server-mcp/tool-catalog.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const computerId = `cmp_${'d'.repeat(16)}`;
const connectionId = `mcp_${'d'.repeat(16)}`;
const credentialHash = 'd'.repeat(64);
const upstreamCalls: unknown[] = [];
const upstream = Bun.serve({
    fetch: async (request) => {
        if (request.method !== 'POST') {
            return new Response(null, { status: 405 });
        }
        const message = (await request.json()) as {
            id?: number;
            method: string;
            params?: Record<string, unknown>;
        };
        if (message.method === 'notifications/initialized') {
            return new Response(null, { status: 202 });
        }
        if (message.method === 'tools/call') {
            upstreamCalls.push(message.params?.arguments);
        }
        const result = {
            initialize: {
                capabilities: { tools: {} },
                protocolVersion: String(message.params?.protocolVersion),
                serverInfo: { name: 'Counting MCP', version: '1.0.0' },
            },
            'tools/call': {
                content: [{ text: `call ${upstreamCalls.length}`, type: 'text' }],
            },
            'tools/list': {
                tools: [{ inputSchema: { properties: {}, type: 'object' }, name: 'append' }],
            },
        }[message.method];
        return Response.json(
            result
                ? { id: message.id, jsonrpc: '2.0', result }
                : {
                      error: { code: -32_601, message: 'Method not found' },
                      id: message.id,
                      jsonrpc: '2.0',
                  }
        );
    },
    hostname: '127.0.0.1',
    port: 0,
});
let harness: HausServerHarness;
let owner: HausClient;
let runnerToken: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_mcp_dispatch'));
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Dispatch',
        slug: 'mcp-dispatch',
    });
    const [user] = await harness.sql`select id from users where auth_subject = 'user_mcp_dispatch'`;
    await harness.sql`
        insert into computers (
            id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
        ) values (
            ${computerId}, ${server.id}, ${user.id}, ${credentialHash},
            ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb,
            'healthy'
        )
    `;
    const { agent } = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Dispatch Agent',
        handle: 'dispatch-agent',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: server.id,
    });
    const chat = await owner.trpc.chat.ensureAgentDm.mutate({
        agentId: agent.id,
        serverId: server.id,
    });
    const minted = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify({
            agentId: agent.id,
            chatId: chat.id,
            credentialHash,
            runId: 'run_mcp_dispatch',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(minted.status).toBe(200);
    ({ runnerToken } = (await minted.json()) as { runnerToken: string });
    await harness.sql`
        insert into mcp_connections (
            id, account_label, server_id, name, auth, url, connected, header_names, preset, tools
        ) values (
            ${connectionId}, 'Fixture', ${server.id}, 'Counting', 'none',
            ${`http://127.0.0.1:${upstream.port}/mcp`}, true, ARRAY[]::text[], null,
            ARRAY['append']
        )
    `;
    await harness.sql`
        insert into mcp_secrets (connection_id, secret)
        values (
            ${connectionId},
            ${{ approvedAuthorizationServerOrigins: [], headers: {}, oauthScopes: [] }}::jsonb
        )
    `;
    await harness.sql`
        insert into agent_mcp_connection_grants (server_id, agent_id, connection_id)
        values (${server.id}, ${agent.id}, ${connectionId})
    `;
});

afterAll(async () => {
    owner?.close();
    await harness?.close();
    upstream.stop(true);
});

test('a repeated dispatch id on MCP invoke calls the upstream tool once', async () => {
    const dispatchId = 'run_mcp_dispatch:toolu_mcp:0';
    const body = { args: { line: 'ship it' }, toolName: modelToolName(connectionId, 'append') };

    const first = await invoke(dispatchId, body);
    const repeat = await invoke(dispatchId, body);
    const next = await invoke('run_mcp_dispatch:toolu_mcp:1', body);

    expect(first).toEqual({
        body: { result: { content: [{ text: 'call 1', type: 'text' }] } },
        status: 200,
    });
    expect(repeat).toEqual(first);
    expect(next.body).toEqual({ result: { content: [{ text: 'call 2', type: 'text' }] } });
    expect(upstreamCalls).toEqual([{ line: 'ship it' }, { line: 'ship it' }]);
});

async function invoke(dispatchId: string, body: Record<string, unknown>) {
    const response = await fetch(new URL('/api/agent/mcp/invoke', harness.url), {
        body: JSON.stringify(body),
        headers: {
            authorization: `Bearer ${runnerToken}`,
            'content-type': 'application/json',
            'haus-dispatch-id': dispatchId,
            'x-haus-mcp-request-id': crypto.randomUUID(),
        },
        method: 'POST',
    });
    return { body: (await response.json()) as unknown, status: response.status };
}
