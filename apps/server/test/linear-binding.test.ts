import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { Tool } from '@modelcontextprotocol/client';
import { eq } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import type { LinearAttemptTarget } from '../src/linear/oauth-attempts.ts';
import { startLinearAttempt } from '../src/linear/oauth-attempts.ts';
import { registerLinearOauthCallback } from '../src/linear/oauth-callback-route.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    linearCredentialsTable,
    linearIdentitiesTable,
    linearTeamAccessTable,
    linearWorkspacesTable,
    mcpConnectionsTable,
    serverMembershipsTable,
} from '../src/postgres/schema.ts';
import { McpInventory } from '../src/server-mcp/inventory.ts';
import { makeServerRuntime } from '../src/server-runtime.ts';
import { type Seed, seedAgent } from './agent-inbox-harness.ts';
import { acme, createFakeLinear, type FakeLinear, grant, teamDesign } from './linear-fixture.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Binding authority (specs/linear-app.md#binding-and-authority): attempt rows
// consumed once, facts read with the new token, role rechecked under the lock,
// one live binding per organization across Servers, and refused tokens revoked.

let cluster: PostgresCluster;
let connection: HausConnection;
let fake: FakeLinear;
let app: FastifyInstance;
let alpha: Seed;
let beta: Seed;
let inventory: McpInventory;
const effectRuntime = makeServerRuntime();
const linearTools: Tool[] = ['list_issues', 'save_issue'].map((name) => ({
    inputSchema: { type: 'object' },
    name,
}));
const appOrigin = 'https://app.haus.test';
const brandIcon = { dark: null, light: 'data:image/png;base64,iVBORw0KGgo=' };
let linearIcon: typeof brandIcon | null = brandIcon; // null: linear.app is unreachable
const linearApp = () => ({ clientId: 'haus-client', fetch: fake.fetch, publicOrigin: appOrigin });

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    fake = createFakeLinear();
    alpha = await seedAgent(connection.db);
    beta = await seedAgent(connection.db);
    inventory = new McpInventory(
        connection.db,
        async () => linearTools,
        () => {},
        effectRuntime
    );
    app = Fastify();
    registerLinearOauthCallback(app, {
        appOrigin,
        db: connection.db,
        linearApp: linearApp(),
        mcpIconResolver: () =>
            linearIcon ? Promise.resolve(linearIcon) : Promise.reject(new Error('offline')),
        // Real inventory: closeConnection forgets (pauses) the id like McpRuntime does,
        // so the callback must resume before its post-install discovery.
        mcpRuntime: {
            closeConnection: async (id: string) => inventory.forget(id),
            inventory,
        } as never,
    });
    await app.ready();
});

afterAll(async () => {
    await app?.close();
    await inventory?.close();
    await effectRuntime.dispose();
    await connection?.close();
    await cluster?.stop();
});

const hausApp = {
    appUserId: 'app-haus',
    displayName: 'Haus',
    organization: acme,
    teams: [teamDesign],
};

async function install(
    seed: Seed,
    code: string,
    target: LinearAttemptTarget = { purpose: 'workspace_install' },
    clientId = 'haus-client'
) {
    const { authorizeUrl } = await startLinearAttempt(connection.db, {
        clientId,
        now: new Date(),
        redirectUri: `${appOrigin}/linear/oauth/callback`,
        serverId: seed.serverId,
        target,
        userId: seed.userId,
    });
    const authorize = new URL(authorizeUrl);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('actor')).toBe('app');
    const state = authorize.searchParams.get('state') ?? '';
    return { callback: () => callback(state, code), state };
}

async function callback(state: string, code: string) {
    const response = await app.inject({
        method: 'GET',
        url: `/linear/oauth/callback?code=${code}&state=${encodeURIComponent(state)}`,
    });
    return { location: response.headers.location ?? '', status: response.statusCode };
}

test('an Owner binds a new workspace once; a replayed state binds nothing', async () => {
    fake.codes.set('code-alpha', hausApp);
    const attempt = await install(alpha, 'code-alpha');
    const first = await attempt.callback();
    expect(first.status).toBe(302);
    expect(first.location).toContain('linear_setup=workspace_connected');
    const [workspace] = await connection.db
        .select()
        .from(linearWorkspacesTable)
        .where(eq(linearWorkspacesTable.serverId, alpha.serverId));
    expect(workspace).toMatchObject({
        appUserId: 'app-haus',
        organizationId: acme.id,
        status: 'active',
    });
    expect(first.location).toContain(`/settings/connections/${workspace?.connectionId}`);
    const [connectionRow] = await connection.db
        .select()
        .from(mcpConnectionsTable)
        .where(eq(mcpConnectionsTable.id, workspace?.connectionId ?? ''));
    expect(connectionRow).toMatchObject({
        // Named for the service; the workspace's URL key tells workspaces apart.
        accountLabel: 'acme',
        auth: 'none',
        connected: true,
        // Branding is stored at bind time so connection reads never fetch it.
        icon: brandIcon,
        name: 'Linear',
        preset: 'linear',
        tools: ['list_issues', 'save_issue'],
    });
    expect(inventory.read(workspace?.connectionId ?? '')).toEqual(linearTools);
    const teams = await connection.db.select().from(linearTeamAccessTable);
    expect(teams.map((team) => team.teamId)).toEqual([teamDesign.id]);
    expect((await callback(attempt.state, 'code-alpha')).status).toBe(400);
});

test('another Server cannot bind the same organization, and never learns where it is bound', async () => {
    fake.codes.set('code-beta', hausApp);
    const result = await (await install(beta, 'code-beta')).callback();
    expect(result.location).toContain('linear_setup=linear_workspace_already_bound');
    expect(result.location).not.toContain(alpha.serverId);
    const rows = await connection.db
        .select()
        .from(mcpConnectionsTable)
        .where(eq(mcpConnectionsTable.serverId, beta.serverId));
    expect(rows).toEqual([]);
    expect(fake.revoked.length).toBe(1);
});

test('a role revoked between start and callback binds nothing and revokes the token', async () => {
    const other = await seedAgent(connection.db);
    fake.codes.set('code-demoted', { ...hausApp, organization: { ...acme, id: 'org-demoted' } });
    const attempt = await install(other, 'code-demoted');
    await connection.db
        .update(serverMembershipsTable)
        .set({ role: 'member' })
        .where(eq(serverMembershipsTable.serverId, other.serverId));
    const revokedBefore = fake.revoked.length;
    const result = await attempt.callback();
    expect(result.location).toContain('linear_setup=linear_admin_required');
    expect(
        await connection.db
            .select()
            .from(linearWorkspacesTable)
            .where(eq(linearWorkspacesTable.serverId, other.serverId))
    ).toEqual([]);
    expect(fake.revoked.length).toBe(revokedBefore + 1);
});

test('an Owner removed from the Server between start and callback binds nothing', async () => {
    const other = await seedAgent(connection.db);
    fake.codes.set('code-removed', { ...hausApp, organization: { ...acme, id: 'org-removed' } });
    const attempt = await install(other, 'code-removed');
    // Removal keeps the row and its role; only `revoked_at` marks it.
    await connection.db
        .update(serverMembershipsTable)
        .set({ revokedAt: new Date() })
        .where(eq(serverMembershipsTable.serverId, other.serverId));
    const result = await attempt.callback();
    expect(result.location).toContain('linear_setup=linear_admin_required');
    expect(
        await connection.db
            .select()
            .from(linearWorkspacesTable)
            .where(eq(linearWorkspacesTable.serverId, other.serverId))
    ).toEqual([]);
});

test('a reconnect into a different organization is refused', async () => {
    const [workspace] = await connection.db
        .select()
        .from(linearWorkspacesTable)
        .where(eq(linearWorkspacesTable.serverId, alpha.serverId));
    fake.codes.set('code-elsewhere', { ...hausApp, organization: { ...acme, id: 'org-other' } });
    const result = await (
        await install(alpha, 'code-elsewhere', {
            connectionId: workspace?.connectionId ?? '',
            purpose: 'workspace_reconnect',
        })
    ).callback();
    expect(result.location).toContain('linear_setup=linear_organization_mismatch');
});

test('a failed icon lookup still binds, and a reconnect fills the missing icon', async () => {
    const seed = await seedAgent(connection.db);
    const facts = { ...hausApp, organization: { ...acme, id: 'org-iconless' } };
    fake.codes.set('code-iconless', facts).set('code-iconless-again', facts);
    linearIcon = null;
    const first = await (await install(seed, 'code-iconless')).callback();
    expect(first.location).toContain('linear_setup=workspace_connected');
    const row = async () =>
        (await connection.db.select().from(mcpConnectionsTable)).find(
            (candidate) => candidate.serverId === seed.serverId
        );
    expect((await row())?.icon).toBeNull();
    linearIcon = brandIcon;
    const target: LinearAttemptTarget = {
        connectionId: (await row())?.id ?? '',
        purpose: 'workspace_reconnect',
    };
    const again = await (await install(seed, 'code-iconless-again', target)).callback();
    expect(again.location).toContain('linear_setup=workspace_reconnected');
    expect((await row())?.icon).toEqual(brandIcon);
});

test('an identity installs as its own app user, and a reinstall must keep that user', async () => {
    const [workspace] = await connection.db
        .select()
        .from(linearWorkspacesTable)
        .where(eq(linearWorkspacesTable.serverId, alpha.serverId));
    const connectionId = workspace?.connectionId ?? '';
    await grant(connection.db, alpha.serverId, alpha.agentId, connectionId);
    const identityId = 'lni_identity00000000';
    await connection.db.insert(linearIdentitiesTable).values({
        agentId: alpha.agentId,
        id: identityId,
        oauthClientId: 'juniper-client',
        organizationId: acme.id,
        serverId: alpha.serverId,
        status: 'draft',
        workspaceId: workspace?.id ?? '',
    });
    const target = { connectionId, identityId, purpose: 'identity_install' } as const;
    fake.codes.set('code-juniper', {
        ...hausApp,
        appUserId: 'app-juniper',
        displayName: 'juniper',
    });
    const installed = await (
        await install(alpha, 'code-juniper', target, 'juniper-client')
    ).callback();
    expect(installed.location).toContain('linear_setup=identity_installed');
    const [identity] = await connection.db
        .select()
        .from(linearIdentitiesTable)
        .where(eq(linearIdentitiesTable.id, target.identityId));
    expect(identity).toMatchObject({
        appUserId: 'app-juniper',
        handle: 'juniper',
        status: 'active',
    });
    const credentials = await connection.db
        .select()
        .from(linearCredentialsTable)
        .where(eq(linearCredentialsTable.identityId, target.identityId));
    expect(credentials).toHaveLength(1);

    await connection.db
        .update(linearIdentitiesTable)
        .set({ status: 'refresh_required' })
        .where(eq(linearIdentitiesTable.id, target.identityId));
    fake.codes.set('code-impostor', {
        ...hausApp,
        appUserId: 'app-impostor',
        displayName: 'impostor',
    });
    const mismatch = await (
        await install(alpha, 'code-impostor', target, 'juniper-client')
    ).callback();
    expect(mismatch.location).toContain('linear_setup=linear_identity_mismatch');
});
