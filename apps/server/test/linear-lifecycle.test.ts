import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { linearConnection } from '../src/linear/linear-connection.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    linearCredentialsTable,
    linearIdentitiesTable,
    linearOutboxTable,
    linearWorkspacesTable,
} from '../src/postgres/schema.ts';
import { seedAgent } from './agent-inbox-harness.ts';
import { seedIdentity, seedWorkspace, teamDesign } from './linear-fixture.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Lifecycle hooks (specs/linear-app.md#lifecycle), each inside the caller's
// transaction: grants move identities between active and inactive, disconnect
// revokes the workspace credential and keeps the binding, delete tombstones.

let cluster: PostgresCluster;
let connection: HausConnection;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

async function bound() {
    const seed = await seedAgent(connection.db);
    const workspace = await seedWorkspace(connection.db, seed, {
        accessToken: 'workspace-token',
        teams: [teamDesign],
    });
    const identity = await seedIdentity(connection.db, seed.serverId, {
        accessToken: 'identity-token',
        agentId: seed.agentId,
        appUserId: `app-${seed.agentId}`,
        teams: [teamDesign],
        workspaceId: workspace.workspaceId,
    });
    await connection.db
        .update(linearWorkspacesTable)
        .set({ defaultAgentId: seed.agentId })
        .where(eq(linearWorkspacesTable.id, workspace.workspaceId));
    return { ...workspace, identity, seed };
}

const identityStatus = async (id: string) =>
    (
        await connection.db
            .select()
            .from(linearIdentitiesTable)
            .where(eq(linearIdentitiesTable.id, id))
    )[0]?.status;

test('a revoked grant parks the identity and clears the default Agent; a regrant restores it', async () => {
    const { connectionId, identity, seed, workspaceId } = await bound();
    const key = { agentId: seed.agentId, connectionId, serverId: seed.serverId };
    await connection.db.transaction(
        (tx) => linearConnection.agentGrantRemoved?.(tx, key) ?? Promise.resolve()
    );
    expect(await identityStatus(identity.identityId)).toBe('inactive');
    const [workspace] = await connection.db
        .select()
        .from(linearWorkspacesTable)
        .where(eq(linearWorkspacesTable.id, workspaceId));
    expect(workspace?.defaultAgentId).toBeNull();
    await connection.db.transaction(
        (tx) => linearConnection.agentGrantAdded?.(tx, key) ?? Promise.resolve()
    );
    expect(await identityStatus(identity.identityId)).toBe('active');
});

test('disconnect revokes the workspace credential through the outbox and keeps the binding', async () => {
    const { connectionId, seed, workspaceId } = await bound();
    await connection.db.transaction(
        (tx) =>
            linearConnection.connectionDisconnected?.(tx, {
                connectionId,
                serverId: seed.serverId,
            }) ?? Promise.resolve()
    );
    const [workspace] = await connection.db
        .select()
        .from(linearWorkspacesTable)
        .where(eq(linearWorkspacesTable.id, workspaceId));
    expect(workspace).toMatchObject({ connectionId, status: 'disconnected' });
    const credentials = await connection.db
        .select()
        .from(linearCredentialsTable)
        .where(eq(linearCredentialsTable.workspaceId, workspaceId));
    expect(credentials.map((row) => row.identityId === null)).toEqual([false]);
    const outbox = await connection.db
        .select()
        .from(linearOutboxTable)
        .where(eq(linearOutboxTable.workspaceId, workspaceId));
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
        input: { clientId: null },
        kind: 'token_revoke',
        state: 'queued',
    });
});

test('delete tombstones the workspace, removes identities, and revokes every credential', async () => {
    const { connectionId, identity, seed, workspaceId } = await bound();
    const wakes = await connection.db.transaction(
        (tx) =>
            linearConnection.connectionDeleted?.(tx, {
                connectionId,
                now: new Date(),
                serverId: seed.serverId,
            }) ?? Promise.resolve([])
    );
    expect(wakes).toEqual([]);
    const [workspace] = await connection.db
        .select()
        .from(linearWorkspacesTable)
        .where(eq(linearWorkspacesTable.id, workspaceId));
    expect(workspace).toMatchObject({ connectionId: null, status: 'removed' });
    expect(await identityStatus(identity.identityId)).toBe('removed');
    expect(
        await connection.db
            .select()
            .from(linearCredentialsTable)
            .where(eq(linearCredentialsTable.workspaceId, workspaceId))
    ).toEqual([]);
    const outbox = await connection.db
        .select()
        .from(linearOutboxTable)
        .where(eq(linearOutboxTable.workspaceId, workspaceId));
    expect(outbox.map((row) => row.kind)).toEqual(['token_revoke', 'token_revoke']);
});
