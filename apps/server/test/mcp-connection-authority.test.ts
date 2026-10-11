import { afterAll, beforeAll, expect, test } from 'bun:test';
import Fastify from 'fastify';
import { registerAgentMcpRoutes } from '../src/agent-api/mcp-routes.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { mcpUpdatedTopic } from '../src/realtime/topics.ts';
import { McpDeniedError } from '../src/server-mcp/errors.ts';
import { McpRuntime } from '../src/server-mcp/runtime.ts';
import { recordToolSnapshot } from '../src/server-mcp/tool-snapshot.ts';
import { makeServerRuntime } from '../src/server-runtime.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const effectRuntime = makeServerRuntime();
const app = Fastify();
const computerId = `cmp_${'g'.repeat(16)}`;
const connectionId = 'mcp_GitHubConnectn01';
const credentialHash = 'd'.repeat(64);
const upstreamTools = ['get_me'];
const calledNames: string[] = [];
let failLists = false;
let harness: HausServerHarness;
let owner: HausClient;
let connection: HausConnection;
let runtime: McpRuntime;
let runnerToken: string;
let serverId: string;
let agentId: string;
let mcp: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
    harness = await startHausServerHarness();
    const token = await harness.clerk.mintSessionToken('user_mcp_grant');
    owner = createHausClient(harness, token);
    const server = await owner.trpc.server.create.mutate({ displayName: 'Grants', slug: 'grants' });
    serverId = server.id;
    const [user] = await harness.sql`select id from users where clerk_user_id = 'user_mcp_grant'`;
    await harness.sql`insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (${computerId}, ${server.id}, ${user.id}, ${credentialHash},
        ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb, 'healthy')`;
    const { agent } = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Grant Agent',
        handle: 'grant-agent',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: server.id,
    });
    agentId = agent.id;
    const chat = await owner.trpc.chat.ensureAgentDm.mutate({
        agentId: agent.id,
        serverId: server.id,
    });
    const minted = await fetch(new URL('/computer/runner/mint', harness.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            agentId: agent.id,
            chatId: chat.id,
            credentialHash,
            runId: 'mcp-grant',
        }),
    });
    expect(minted.status).toBe(200);
    ({ runnerToken } = (await minted.json()) as { runnerToken: string });
    mcp = Bun.serve({ fetch: handleMcp, hostname: '127.0.0.1', port: 0 });
    await harness.sql`insert into mcp_connections (id, server_id, name, url, auth, connected, header_names, tools)
        values (${connectionId}, ${server.id}, 'GitHub', ${`http://127.0.0.1:${mcp.port}/mcp`}, 'none', true, '{}'::text[], ARRAY['get_me'])`;
    await harness.sql`insert into mcp_secrets (connection_id, secret)
        values (${connectionId}, ${{ approvedAuthorizationServerOrigins: [], headers: {}, oauthScopes: [] }}::jsonb)`;
    await harness.sql`insert into agent_mcp_connection_grants (server_id, agent_id, connection_id)
        values (${server.id}, ${agent.id}, ${connectionId})`;
    connection = await connectHausDatabase(harness.databaseUrl);
    runtime = new McpRuntime(connection.db, effectRuntime);
    registerAgentMcpRoutes(app, { db: connection.db, runtime });
}, 60_000);

afterAll(async () => {
    await app.close();
    await runtime?.close();
    await effectRuntime.dispose();
    await connection?.close();
    owner?.close();
    mcp?.stop(true);
    await harness?.close();
});

test('a connection grant covers live tools and the snapshot stays display-only', async () => {
    const first = (await runtime.listAgentTools(serverId, agentId)).map((tool) => tool.name);
    expect(first).toEqual(['mcp__mcp_GitHubConnectn01__get_me_36d2ed4d']);
    upstreamTools.push('actions_run_trigger', 'actions_list');
    expect(
        await runtime.invoke({
            agentId,
            args: {},
            serverId,
            toolName: 'mcp__mcp_GitHubConnectn01__actions_list_9858e5b5',
        })
    ).toMatchObject({ content: [{ text: 'ran actions_list', type: 'text' }] });
    expect(calledNames).toEqual(['actions_list']);
    expect(await storedTools()).toEqual(['get_me']);

    const recorded = await countUpdates(async () => {
        expect((await runtime.listAgentTools(serverId, agentId)).map((tool) => tool.name)).toEqual([
            'mcp__mcp_GitHubConnectn01__get_me_36d2ed4d',
            'mcp__mcp_GitHubConnectn01__actions_run_trigger_5cbb3762',
            'mcp__mcp_GitHubConnectn01__actions_list_9858e5b5',
        ]);
    });
    expect(recorded).toBe(1);
    expect(await storedTools()).toEqual(['actions_list', 'actions_run_trigger', 'get_me']);
    const version = await rowVersion();
    expect(await countUpdates(async () => runtime.listAgentTools(serverId, agentId))).toBe(0);
    expect(await rowVersion()).toBe(version);
    upstreamTools.splice(0, upstreamTools.length, 'get_me');
    await runtime.listAgentTools(serverId, agentId);
    expect(await storedTools()).toEqual(['actions_list', 'actions_run_trigger', 'get_me']);

    failLists = true;
    expect(await runtime.listAgentTools(serverId, agentId)).toEqual([]);
    expect(await storedTools()).toEqual(['actions_list', 'actions_run_trigger', 'get_me']);
    await runtime.closeConnection(connectionId);
    const unavailable = await runtime
        .invoke({
            agentId,
            args: {},
            serverId,
            toolName: 'mcp__mcp_GitHubConnectn01__actions_get_dcb43ea9',
        })
        .catch((cause: unknown) => cause);
    expect(unavailable).not.toBeInstanceOf(McpDeniedError);
    expect(unavailable).toMatchObject({ code: 'MCP_UNAVAILABLE' });
    failLists = false;

    const scope = { agentId, serverId };
    await harness.sql`update mcp_connections set connected = false where id = ${connectionId}`;
    await recordToolSnapshot(connection.db, scope, connectionId, ['x']);
    expect(await storedTools()).toEqual(['actions_list', 'actions_run_trigger', 'get_me']);
    await harness.sql`update mcp_connections set connected = true where id = ${connectionId}`;
    await harness.sql`delete from agent_mcp_connection_grants
        where server_id = ${serverId} and agent_id = ${agentId} and connection_id = ${connectionId}`;
    await recordToolSnapshot(connection.db, scope, connectionId, ['x']);
    expect(await storedTools()).toEqual(['actions_list', 'actions_run_trigger', 'get_me']);
    await harness.sql`insert into agent_mcp_connection_grants (server_id, agent_id, connection_id)
        values (${serverId}, ${agentId}, ${connectionId})`;
    await recordToolSnapshot(connection.db, scope, connectionId, ['x']);
    expect(await storedTools()).toEqual(['actions_list', 'actions_run_trigger', 'get_me', 'x']);
    const callsBefore = calledNames.length;
    const otherAgent = await runtime
        .invoke({
            agentId: 'agent_other',
            args: {},
            serverId,
            toolName: 'mcp__mcp_GitHubConnectn01__actions_list_9858e5b5',
        })
        .catch((cause: unknown) => cause);
    expect(otherAgent).toMatchObject({
        code: 'MCP_DENIED',
        message:
            'This Agent has no access to the GitHub connection. Ask a Server Owner or Admin to grant this Agent access to GitHub.',
    });
    expect(calledNames).toHaveLength(callsBefore);

    await harness.sql`delete from agent_mcp_connection_grants
        where server_id = ${serverId} and agent_id = ${agentId} and connection_id = ${connectionId}`;
    const denied = await app.inject({
        url: '/api/agent/mcp/invoke',
        method: 'POST',
        headers: {
            authorization: `Bearer ${runnerToken}`,
            'x-haus-mcp-request-id': crypto.randomUUID(),
        },
        payload: {
            args: {},
            toolName: 'mcp__mcp_GitHubConnectn01__actions_run_trigger_5cbb3762',
        },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({
        code: 'MCP_DENIED',
        message:
            'This Agent has no access to the GitHub connection. Ask a Server Owner or Admin to grant this Agent access to GitHub.',
    });
}, 30_000);

async function handleMcp(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response(null, { status: 405 });
    }
    const message = (await request.json()) as {
        id?: number;
        method: string;
        params?: { name?: string; protocolVersion?: string };
    };
    if (message.method === 'notifications/initialized') {
        return new Response(null, { status: 202 });
    }
    if (failLists && message.method === 'tools/list') {
        return new Response('unavailable', { status: 503 });
    }
    const result =
        message.method === 'initialize'
            ? {
                  capabilities: { tools: {} },
                  protocolVersion: String(message.params?.protocolVersion),
                  serverInfo: { name: 'GitHub', version: '1.0.0' },
              }
            : message.method === 'tools/list'
              ? {
                    tools: upstreamTools.map((name) => ({
                        inputSchema: { type: 'object' },
                        name,
                    })),
                }
              : message.method === 'tools/call'
                ? {
                      content: [{ text: `ran ${message.params?.name ?? ''}`, type: 'text' }],
                  }
                : null;
    if (message.method === 'tools/call') {
        calledNames.push(message.params?.name ?? '');
    }
    return Response.json({ id: message.id, jsonrpc: '2.0', result });
}

async function storedTools(): Promise<string[]> {
    const [row] = (await harness.sql`
        select tools from mcp_connections where id = ${connectionId}
    `) as { tools: string[] }[];
    return row?.tools ?? [];
}

async function rowVersion(): Promise<string> {
    const [row] = (await harness.sql`
        select xmin::text as xmin from mcp_connections where id = ${connectionId}
    `) as { xmin: string }[];
    return row?.xmin ?? '';
}

/** Counts `mcp.updated` for this Server while `body` runs. Announce is synchronous. */
async function countUpdates(body: () => Promise<unknown>): Promise<number> {
    let count = 0;
    const controller = new AbortController();
    const listening = (async () => {
        try {
            for await (const delivery of mcpUpdatedTopic.subscribe(controller.signal)) {
                if (delivery.event.serverId === serverId) {
                    count += 1;
                }
            }
        } catch {
            // Aborting the subscription ends the counter after `body` returns.
        }
    })();
    await Bun.sleep(0);
    await body();
    await Bun.sleep(0);
    controller.abort();
    await listening;
    return count;
}
