import { afterAll, beforeAll, expect, test } from 'bun:test';
import Fastify from 'fastify';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { registerMcpOAuthCallback } from '../src/server-mcp/oauth-callback-route.ts';
import { McpOAuthRelay } from '../src/server-mcp/oauth-relay.ts';
import { emptySecret, McpRuntime } from '../src/server-mcp/runtime.ts';
import { makeServerRuntime } from '../src/server-runtime.ts';
import { startControlledOAuthMcpProvider } from './controlled-oauth-mcp.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

const connectionId = 'mcp_oauthrelaytest01';
const redirectUrl = 'http://127.0.0.1:8091/mcp/oauth/callback';
const serverId = 'srv_oauthrelaytest01';

let cluster: PostgresCluster;
let connection: HausConnection;
let provider: Awaited<ReturnType<typeof startControlledOAuthMcpProvider>>;
let runtime: McpRuntime;
const effectRuntime = makeServerRuntime();

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    provider = await startControlledOAuthMcpProvider();
    runtime = new McpRuntime(connection.db, effectRuntime);
    await connection.db.execute(
        `insert into servers (id, display_name, slug)
         values ('${serverId}', 'OAuth Relay', 'oauth-relay')`
    );
    await connection.db.execute(
        `insert into mcp_connections
            (id, server_id, name, url, auth, connected, header_names, tools)
         values
            ('${connectionId}', '${serverId}', 'Controlled', '${provider.origin}/mcp',
             'oauth', false, ARRAY[]::text[], ARRAY[]::text[])`
    );
    await runtime.writeSecret(connectionId, emptySecret());
});

afterAll(async () => {
    await runtime.close();
    await effectRuntime.dispose();
    provider.stop();
    await connection.close();
    await cluster.stop();
});

test('completes OAuth on Server and persists discovered identity and tools', async () => {
    const relay = new McpOAuthRelay(connection.db, runtime);
    const trust = await relay.start({
        allowAuthorizationServerOrigin: false,
        connectionId,
        redirectUrl,
    });
    expect(trust).toEqual({
        authorizationServerOrigin: provider.origin,
        status: 'trust-required',
    });

    const started = await relay.start({
        allowAuthorizationServerOrigin: true,
        connectionId,
        redirectUrl,
    });
    expect(started.status).toBe('ready');
    if (started.status !== 'ready') {
        throw new Error('Expected a ready OAuth attempt.');
    }
    const authorization = new URL(started.authorizationUrl);
    const callback = await approve(authorization);
    const state = callback.searchParams.get('state');
    const code = callback.searchParams.get('code');
    expect(state).toBeTruthy();
    expect(code).toBeTruthy();

    const app = Fastify();
    registerMcpOAuthCallback(app, relay);
    try {
        const response = await app.inject({
            method: 'GET',
            url: callback.pathname + callback.search,
        });
        expect(response.statusCode).toBe(200);
        expect(response.body).toContain('Connection complete');
    } finally {
        await app.close();
    }
    await expect(relay.complete(String(state), String(code))).resolves.toEqual({
        status: 'expired',
    });

    const [stored] = await connection.db.execute<{
        account_label: string;
        connected: boolean;
        tools: string[];
    }>(
        `select account_label, connected, tools
         from mcp_connections where id = '${connectionId}'`
    );
    expect(stored).toEqual({
        account_label: 'controlled@example.test',
        connected: true,
        tools: ['echo'],
    });
    expect(provider.registrations()).toBe(1);
    expect(await runtime.readSecret(connectionId)).toMatchObject({
        approvedAuthorizationServerOrigins: [provider.origin],
        tokens: {
            access_token: 'controlled-access',
            refresh_token: 'controlled-refresh',
            token_type: 'Bearer',
        },
    });
});

test.each(['missing', 'mismatched'])('rejects a %s callback issuer', async (kind) => {
    const relay = new McpOAuthRelay(connection.db, runtime);
    const started = await relay.start({
        allowAuthorizationServerOrigin: false,
        connectionId,
        redirectUrl,
    });
    if (started.status !== 'ready') {
        throw new Error('Expected a ready OAuth attempt.');
    }
    const callback = await approve(new URL(started.authorizationUrl));
    if (kind === 'missing') {
        callback.searchParams.delete('iss');
    } else {
        callback.searchParams.set('iss', 'https://different-issuer.example');
    }
    const app = Fastify();
    registerMcpOAuthCallback(app, relay);
    try {
        const response = await app.inject({
            method: 'GET',
            url: callback.pathname + callback.search,
        });
        expect(response.statusCode).toBe(400);
        expect(response.body).toContain('Connection failed');
        expect((await runtime.readSecret(connectionId)).tokens).toBeUndefined();
    } finally {
        await app.close();
    }
});

test('expires routing state before exchanging the callback code', async () => {
    let now = 1000;
    const relay = new McpOAuthRelay(connection.db, runtime, () => now, 50);
    const started = await relay.start({
        allowAuthorizationServerOrigin: false,
        connectionId,
        redirectUrl,
    });
    expect(started.status).toBe('ready');
    if (started.status !== 'ready') {
        throw new Error('Expected a ready OAuth attempt.');
    }
    const authorization = new URL(started.authorizationUrl);
    now += 51;

    await expect(
        relay.complete(String(authorization.searchParams.get('state')), 'unused-code')
    ).resolves.toEqual({ status: 'expired' });
});

async function approve(authorization: URL): Promise<URL> {
    const response = await fetch(`${authorization.origin}/approve`, {
        body: new URLSearchParams({
            code_challenge: authorization.searchParams.get('code_challenge') ?? '',
            redirect_uri: authorization.searchParams.get('redirect_uri') ?? '',
            state: authorization.searchParams.get('state') ?? '',
        }),
        method: 'POST',
        redirect: 'manual',
    });
    const location = response.headers.get('location');
    if (!location) {
        throw new Error('The controlled OAuth provider did not return a callback.');
    }
    return new URL(location);
}
