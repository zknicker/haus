import { afterAll, beforeAll, expect, test } from 'bun:test';
import { makeTelemetryLayer } from '@haus/effect';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ManagedRuntime } from 'effect';
import Fastify from 'fastify';
import { registerAgentMcpRoutes } from '../src/agent-api/mcp-routes.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { McpRuntime } from '../src/server-mcp/runtime.ts';
import { makeClient } from '../src/server-mcp/runtime-test-fixtures.ts';
import { modelToolName } from '../src/server-mcp/tool-catalog.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const exporter = new InMemorySpanExporter();
const effectRuntime = ManagedRuntime.make(
    makeTelemetryLayer({
        serviceName: 'haus-test',
        spanProcessor: new SimpleSpanProcessor(exporter),
    })
);
const app = Fastify();
const computerId = `cmp_${'t'.repeat(16)}`;
const connectionId = `mcp_${'t'.repeat(16)}`;
const credentialHash = 'c'.repeat(64);
const traceId = 'a'.repeat(32);
const parentId = 'b'.repeat(16);
let harness: HausServerHarness;
let owner: HausClient;
let connection: HausConnection;
let runtime: McpRuntime;
let runnerToken: string;
let otherRunnerToken: string;
let serverId: string;
let agentId: string;
let appOrigin: string;
let hangNext = false;
let started = Promise.withResolvers<void>();
let aborted = Promise.withResolvers<void>();

beforeAll(async () => {
    harness = await startHausServerHarness();
    const token = await harness.clerk.mintSessionToken('user_mcp_trace');
    owner = createHausClient(harness, token);
    const server = await owner.trpc.server.create.mutate({ displayName: 'Trace', slug: 'trace' });
    serverId = server.id;
    const [user] = await harness.sql`select id from users where clerk_user_id = 'user_mcp_trace'`;
    await harness.sql`insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (${computerId}, ${server.id}, ${user.id}, ${credentialHash},
        ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb, 'healthy')`;
    const { agent } = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Trace Agent',
        handle: 'trace-agent',
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
            runId: 'trace-route',
        }),
    });
    expect(minted.status).toBe(200);
    ({ runnerToken } = await minted.json());
    const { agent: other } = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Other',
        handle: 'other',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    const otherChat = await owner.trpc.chat.ensureAgentDm.mutate({ agentId: other.id, serverId });
    const otherMinted = await fetch(new URL('/computer/runner/mint', harness.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            agentId: other.id,
            chatId: otherChat.id,
            credentialHash,
            runId: 'other-mcp',
        }),
    });
    ({ runnerToken: otherRunnerToken } = await otherMinted.json());
    await harness.sql`insert into mcp_connections (id, server_id, name, url, auth, connected, header_names, tools)
        values (${connectionId}, ${server.id}, 'Fixture', 'https://example.test/mcp', 'none', true, '{}'::text[], ARRAY['echo'])`;
    await harness.sql`insert into agent_mcp_connection_grants (server_id, agent_id, connection_id)
        values (${server.id}, ${agent.id}, ${connectionId})`;
    connection = await connectHausDatabase(harness.databaseUrl);
    runtime = new McpRuntime(connection.db, effectRuntime, {
        clientFactory: async () =>
            makeClient('Fixture', {
                call: async (request) => {
                    if (!hangNext) {
                        return { content: [{ type: 'text', text: 'ok' }] };
                    }
                    hangNext = false;
                    started.resolve();
                    return await new Promise((_resolve, reject) =>
                        request.options?.signal?.addEventListener(
                            'abort',
                            () => {
                                aborted.resolve();
                                reject(new Error('cancelled'));
                            },
                            { once: true }
                        )
                    );
                },
            }).client,
    });
    registerAgentMcpRoutes(app, { db: connection.db, runtime });
    appOrigin = await app.listen({ host: '127.0.0.1', port: 0 });
});

afterAll(async () => {
    await app.close();
    await runtime?.close();
    await effectRuntime.dispose();
    await connection?.close();
    owner?.close();
    await harness?.close();
});

test('authenticated MCP discovery and invocation continue valid context; malformed context never changes the operation or exports secrets', async () => {
    const valid = `00-${traceId}-${parentId}-01`;
    for (const traceparent of [
        valid,
        'invalid-private-context',
        `00-${'0'.repeat(32)}-${parentId}-01`,
    ]) {
        exporter.reset();
        const headers = {
            authorization: `Bearer ${runnerToken}`,
            'x-haus-mcp-request-id': crypto.randomUUID(),
            traceparent,
        };
        const discovery = await app.inject({ url: '/api/agent/mcp/tools', headers });
        expect(discovery.statusCode).toBe(200);
        const invocation = await app.inject({
            url: '/api/agent/mcp/invoke',
            method: 'POST',
            headers,
            payload: {
                toolName: modelToolName(connectionId, 'echo'),
                args: { secret: 'private-request-payload' },
            },
        });
        expect(invocation.statusCode).toBe(200);
        const spans = exporter.getFinishedSpans();
        expect(spans).toHaveLength(2);
        for (const span of spans) {
            expect(span.name).toBe('haus.mcp.operation');
            if (traceparent === valid) {
                expect(span.spanContext().traceId).toBe(traceId);
                expect(span.parentSpanContext?.spanId).toBe(parentId);
            } else {
                expect(span.parentSpanContext).toBeUndefined();
            }
            const exported = JSON.stringify({
                attributes: span.attributes,
                events: span.events,
                status: span.status,
            });
            expect(exported).not.toContain(runnerToken);
            expect(exported).not.toContain('private-request-payload');
            expect(exported).not.toContain('invalid-private-context');
        }
    }
    exporter.reset();
    const rejected = await app.inject({
        url: '/api/agent/mcp/tools',
        headers: { authorization: 'Bearer wrong', traceparent: valid },
    });
    expect(rejected.statusCode).toBe(401);
    expect(exporter.getFinishedSpans()).toHaveLength(0);
});

test('runner authority survives discovery, revoke, guessed invocation and regrant', async () => {
    const payload = { toolName: modelToolName(connectionId, 'echo'), args: {} };
    const headers = {
        authorization: `Bearer ${runnerToken}`,
        'x-haus-mcp-request-id': crypto.randomUUID(),
    };
    const foreign = {
        authorization: `Bearer ${otherRunnerToken}`,
        'x-haus-mcp-request-id': crypto.randomUUID(),
    };
    expect(
        (await app.inject({ url: '/api/agent/mcp/tools', headers: foreign })).json().tools
    ).toEqual([]);
    expect(
        (
            await app.inject({
                url: '/api/agent/mcp/invoke',
                method: 'POST',
                headers: foreign,
                payload,
            })
        ).statusCode
    ).toBe(403);
    expect(
        (
            await app.inject({
                url: '/api/agent/mcp/invoke',
                method: 'POST',
                headers: foreign,
                payload: { ...payload, agentId },
            })
        ).statusCode
    ).toBe(400);
    await harness.sql`delete from agent_mcp_connection_grants where agent_id = ${agentId} and connection_id = ${connectionId}`;
    expect((await app.inject({ url: '/api/agent/mcp/tools', headers })).json().tools).toEqual([]);
    expect(
        (
            await app.inject({ url: '/api/agent/mcp/invoke', method: 'POST', headers, payload })
        ).json().code
    ).toBe('MCP_DENIED');
    await harness.sql`insert into agent_mcp_connection_grants (server_id, agent_id, connection_id) values (${serverId}, ${agentId}, ${connectionId})`;
    expect(
        (await app.inject({ url: '/api/agent/mcp/invoke', method: 'POST', headers, payload }))
            .statusCode
    ).toBe(200);
});

test('explicit cancellation aborts only its own active MCP request even after runner revocation', async () => {
    hangNext = true;
    started = Promise.withResolvers<void>();
    aborted = Promise.withResolvers<void>();
    const requestId = crypto.randomUUID();
    const response = fetch(new URL('/api/agent/mcp/invoke', appOrigin), {
        method: 'POST',
        headers: {
            authorization: `Bearer ${runnerToken}`,
            'x-haus-mcp-request-id': requestId,
            'content-type': 'application/json',
        },
        body: JSON.stringify({ toolName: modelToolName(connectionId, 'echo'), args: {} }),
    });
    await started.promise;
    const foreign = await app.inject({
        url: '/api/agent/mcp/cancel',
        method: 'POST',
        headers: { authorization: `Bearer ${otherRunnerToken}` },
        payload: { requestId },
    });
    expect(foreign.statusCode).toBe(200);
    await harness.sql`update agent_runner_credentials set revoked_at = now() where agent_id = ${agentId}`;
    const cancelled = await app.inject({
        url: '/api/agent/mcp/cancel',
        method: 'POST',
        headers: { authorization: `Bearer ${runnerToken}` },
        payload: { requestId },
    });
    expect(cancelled.statusCode).toBe(200);
    await aborted.promise;
    expect((await response).status).toBe(502);
});
