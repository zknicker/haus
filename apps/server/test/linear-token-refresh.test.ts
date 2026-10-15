import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { LinearSignInRequiredError } from '../src/linear/linear-errors.ts';
import { LinearTokenRefresher } from '../src/linear/token-refresh.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    linearCredentialsTable,
    linearWorkspacesTable,
    mcpConnectionsTable,
} from '../src/postgres/schema.ts';
import { seedAgent } from './agent-inbox-harness.ts';
import {
    acme,
    createFakeLinear,
    type FakeLinear,
    seedWorkspace,
    teamDesign,
} from './linear-fixture.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Token refresh (specs/linear-app.md#tokens): single flight per (credential,
// generation), compare-and-swap on the generation read, and a loser adopts the
// winner instead of marking the credential failed.

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

const actor = {
    appUserId: 'app-haus',
    displayName: 'Haus',
    organization: acme,
    teams: [teamDesign],
};

async function expiringCredential(fake: FakeLinear, refreshToken: string) {
    const seed = await seedAgent(connection.db);
    fake.refreshTokens.set(refreshToken, actor);
    const seeded = await seedWorkspace(connection.db, seed, {
        accessToken: `old-${refreshToken}`,
        expiresAt: new Date(Date.now() + 60_000),
        refreshToken,
        teams: [teamDesign],
    });
    return { ...seeded, seed };
}

const refresher = (fake: FakeLinear) =>
    new LinearTokenRefresher({
        app: { clientId: 'haus-client', fetch: fake.fetch },
        clock: { now: () => new Date() },
        db: connection.db,
    });

async function credential(id: string) {
    const [row] = await connection.db
        .select()
        .from(linearCredentialsTable)
        .where(eq(linearCredentialsTable.id, id));
    return row;
}

test('concurrent refreshes of one credential share one exchange', async () => {
    const fake = createFakeLinear();
    const { credentialId } = await expiringCredential(fake, 'ref-shared');
    const tokens = refresher(fake);
    const results = await Promise.all([
        tokens.fresh(credentialId, 600_000),
        tokens.fresh(credentialId, 600_000),
        tokens.fresh(credentialId, 600_000),
    ]);
    expect(fake.refreshCalls).toBe(1);
    expect(new Set(results.map((row) => row.accessToken)).size).toBe(1);
    expect(await credential(credentialId)).toMatchObject({ generation: 2, state: 'valid' });
});

test("a CAS loser's invalid_grant after the winner's success adopts the winner", async () => {
    const fake = createFakeLinear();
    const { credentialId } = await expiringCredential(fake, 'ref-raced');
    let releaseWinner = () => {};
    let releaseLoser = () => {};
    fake.refreshGates.set(0, new Promise<void>((resolve) => (releaseWinner = resolve)));
    fake.refreshGates.set(1, new Promise<void>((resolve) => (releaseLoser = resolve)));
    // Two Server processes: separate single-flight maps, one database.
    const winner = refresher(fake).fresh(credentialId, 600_000);
    const loser = refresher(fake).fresh(credentialId, 600_000);
    await Bun.sleep(50);
    releaseWinner();
    const won = await winner;
    releaseLoser();
    const adopted = await loser;
    expect(fake.refreshCalls).toBe(2);
    expect(adopted.accessToken).toBe(won.accessToken);
    expect(await credential(credentialId)).toMatchObject({ generation: 2, state: 'valid' });
});

test('invalid_grant at the current generation requires sign-in and takes the workspace with it', async () => {
    const fake = createFakeLinear();
    const { connectionId, credentialId, workspaceId } = await expiringCredential(fake, 'ref-dead');
    fake.refreshTokens.delete('ref-dead');
    await expect(refresher(fake).fresh(credentialId, 600_000)).rejects.toBeInstanceOf(
        LinearSignInRequiredError
    );
    expect(await credential(credentialId)).toMatchObject({
        generation: 1,
        state: 'refresh_required',
    });
    const [workspace] = await connection.db
        .select()
        .from(linearWorkspacesTable)
        .where(eq(linearWorkspacesTable.id, workspaceId));
    expect(workspace?.status).toBe('refresh_required');
    const [row] = await connection.db
        .select()
        .from(mcpConnectionsTable)
        .where(eq(mcpConnectionsTable.id, connectionId));
    expect(row?.connected).toBe(false);
});

test('a token that outlives the window is used as is', async () => {
    const fake = createFakeLinear();
    const seed = await seedAgent(connection.db);
    const { credentialId } = await seedWorkspace(connection.db, seed, {
        accessToken: 'still-good',
        teams: [teamDesign],
    });
    expect((await refresher(fake).fresh(credentialId, 600_000)).accessToken).toBe('still-good');
    expect(fake.refreshCalls).toBe(0);
});
