import { afterAll, beforeAll, expect, test } from 'bun:test';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { emptySecret } from '../src/server-mcp/connection-secret.ts';
import { McpOAuthRelay } from '../src/server-mcp/oauth-relay.ts';
import { McpRuntime } from '../src/server-mcp/runtime.ts';
import { makeServerRuntime } from '../src/server-runtime.ts';
import {
    approveControlledAuthorization,
    startControlledOAuthMcpProvider,
} from './controlled-oauth-mcp.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// The incident: a provider rejected every refresh token at once, the SDK dropped
// the tokens, Settings still said connected, and signing in again wiped every grant.
const agentId = 'agt_oauthreauthtest1';
const connectionId = 'mcp_oauthreauthtest1';
const redirectUrl = 'http://127.0.0.1:8091/mcp/oauth/callback';
const serverId = 'srv_oauthreauthtest1';

let cluster: PostgresCluster;
let connection: HausConnection;
let provider: Awaited<ReturnType<typeof startControlledOAuthMcpProvider>>;
let relay: McpOAuthRelay;
let runtime: McpRuntime;
const effectRuntime = makeServerRuntime();

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    provider = await startControlledOAuthMcpProvider();
    runtime = new McpRuntime(connection.db, effectRuntime);
    relay = new McpOAuthRelay(connection.db, runtime);
    await connection.db.execute(
        `insert into servers (id, display_name, slug)
         values ('${serverId}', 'OAuth Reauth', 'oauth-reauth')`
    );
    await connection.db.execute(
        `insert into agents (id, server_id, handle, display_name, home_timezone)
         values ('${agentId}', '${serverId}', 'reauth', 'Reauth', 'America/New_York')`
    );
    await connection.db.execute(
        `insert into mcp_connections
            (id, server_id, name, url, auth, connected, header_names, tools)
         values
            ('${connectionId}', '${serverId}', 'Controlled', '${provider.origin}/mcp',
             'oauth', false, ARRAY[]::text[], ARRAY[]::text[])`
    );
    await runtime.writeSecret(connectionId, {
        ...emptySecret(),
        approvedAuthorizationServerOrigins: [provider.origin],
    });
    await signIn();
    await connection.db.execute(
        `insert into agent_mcp_connection_grants (server_id, agent_id, connection_id)
         values ('${serverId}', '${agentId}', '${connectionId}')`
    );
});

afterAll(async () => {
    await runtime.close();
    await effectRuntime.dispose();
    provider.stop();
    await connection.close();
    await cluster.stop();
});

test('starting a sign-in leaves the working connection and its grants alone', async () => {
    const started = await startSignIn();

    expect(started.searchParams.get('state')).toBeTruthy();
    expect(await readConnection()).toEqual({
        account_label: 'controlled@example.test',
        connected: true,
        tools: ['echo'],
    });
    expect((await runtime.readSecret(connectionId)).tokens).toMatchObject({
        access_token: 'controlled-access',
    });
    expect(await readGrants()).toEqual([agentId]);
    // The abandoned attempt never finishes; the live client still works upstream.
    await expect(runtime.inventory.refresh(connectionId)).resolves.toBeUndefined();
    expect(runtime.inventory.read(connectionId).map((tool) => tool.name)).toEqual(['echo']);
});

test('completing a sign-in again keeps Agent grants', async () => {
    await signIn();

    expect(await readConnection()).toMatchObject({ connected: true, tools: ['echo'] });
    expect(await readGrants()).toEqual([agentId]);
});

test('a transient refresh failure with tokens intact keeps the connection connected', async () => {
    provider.rotateAccessToken('controlled-access-2');
    provider.setTokenOutage(true);
    try {
        await expect(runtime.inventory.refresh(connectionId)).rejects.toMatchObject({
            code: 'MCP_AUTH_REQUIRED',
        });
    } finally {
        provider.setTokenOutage(false);
    }

    expect((await runtime.readSecret(connectionId)).tokens).toBeDefined();
    expect(await readConnection()).toMatchObject({ connected: true });
    expect(await readGrants()).toEqual([agentId]);
});

test('a rejected refresh marks the connection sign-in required and keeps grants', async () => {
    // The access token is already rotated; the refresh now meets invalid_grant.
    await expect(runtime.inventory.refresh(connectionId)).rejects.toMatchObject({
        code: 'MCP_AUTH_REQUIRED',
    });

    expect((await runtime.readSecret(connectionId)).tokens).toBeUndefined();
    expect(await readConnection()).toMatchObject({ connected: false, tools: ['echo'] });
    expect(await readGrants()).toEqual([agentId]);

    await signIn();
    expect(await readConnection()).toMatchObject({ connected: true, tools: ['echo'] });
    expect(await readGrants()).toEqual([agentId]);
    await expect(runtime.inventory.refresh(connectionId)).resolves.toBeUndefined();
});

async function startSignIn(): Promise<URL> {
    const started = await relay.start({
        allowAuthorizationServerOrigin: false,
        connectionId,
        redirectUrl,
    });
    if (started.status !== 'ready') {
        throw new Error('Expected a ready OAuth attempt.');
    }
    return new URL(started.authorizationUrl);
}

async function signIn(): Promise<void> {
    const callback = await approveControlledAuthorization(await startSignIn());
    const result = await relay.complete(
        String(callback.searchParams.get('state')),
        String(callback.searchParams.get('code')),
        callback.searchParams.get('iss') ?? undefined
    );
    expect(result).toEqual({ status: 'complete' });
}

async function readConnection() {
    const [row] = await connection.db.execute<{
        account_label: string | null;
        connected: boolean;
        tools: string[];
    }>(`select account_label, connected, tools from mcp_connections where id = '${connectionId}'`);
    return row;
}

async function readGrants(): Promise<string[]> {
    const rows = await connection.db.execute<{ agent_id: string }>(
        `select agent_id from agent_mcp_connection_grants where connection_id = '${connectionId}'`
    );
    return rows.map((row) => row.agent_id);
}
