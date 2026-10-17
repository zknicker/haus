import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { listLinearIdentities } from '../src/haus-api/linear/identity-view.ts';
import { joinTeamsAfterIdentityInstall } from '../src/linear/team-membership.ts';
import { syncLinearTeams } from '../src/linear/team-sync.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { linearTeamAccessTable } from '../src/postgres/schema.ts';
import { createFakeLinear, type FakeActor, type FakeLinear } from './linear-fixture.ts';
import { desTeamId, seedLinearIdentity, seedLinearSessionWorld } from './linear-session-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Team membership (specs/linear-app.md#team-scope): the sync persists which
// reached teams each actor is a member of, and an identity joins exactly the
// teams the Haus app is a member of that Linear lets it join, never more.

let cluster: PostgresCluster;
let connection: HausConnection;
let fake: FakeLinear;
/** Credential id → the access token the fake Linear knows. */
const tokens = new Map<string, string>();

const des = { id: desTeamId, key: 'DES', name: 'Design' };
const ops = { id: 'team-ops', key: 'OPS', name: 'Ops' };
const legal = { id: 'team-legal', key: 'LEG', name: 'Legal' };
const organization = { id: 'org', name: 'Haus', urlKey: 'haus' };

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    fake = createFakeLinear();
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

/** A workspace whose Haus app reaches every team, is a member of DES and OPS, and one identity. */
async function world(identityActor: Omit<FakeActor, 'appUserId' | 'displayName' | 'organization'>) {
    const seeded = await seedLinearSessionWorld(connection.db);
    const identity = await seedLinearIdentity(connection.db, seeded, seeded.agents.juniper);
    actor(seeded.credentialId, {
        appUserId: seeded.workspaceAppUserId,
        memberTeamIds: [des.id, ops.id],
        teams: [des, ops, legal],
    });
    actor(identity.credentialId, { ...identityActor, appUserId: identity.appUserId });
    return { identity, seeded };
}

function actor(
    credentialId: string,
    input: Pick<FakeActor, 'appUserId' | 'teams'> & Partial<FakeActor>
) {
    const token = `token-${credentialId}`;
    tokens.set(credentialId, token);
    fake.tokens.set(token, { displayName: input.appUserId, organization, ...input });
}

function sync(workspaceId: string, fetch: typeof globalThis.fetch = fake.fetch) {
    return syncLinearTeams(
        {
            accessToken: (credentialId) => Promise.resolve(tokens.get(credentialId) ?? ''),
            clock: { now: () => new Date() },
            db: connection.db,
            fetch,
        },
        { workspaceId }
    );
}

/**
 * The fake Linear, except the first team read with `token` answers only once a
 * second one arrives (or after a second, when none can), and a team joined
 * once refuses the next join, as Linear refuses re-adding a member.
 */
function overlappingReads(token: string): typeof fetch {
    const secondRead = Promise.withResolvers<void>();
    let reads = 0;
    return (async (input: string | URL | Request, init?: RequestInit) => {
        const body = String(init?.body ?? '');
        const authorization = new Headers(init?.headers).get('authorization');
        if (authorization === `Bearer ${token}` && body.includes('HausTeams')) {
            reads += 1;
            if (reads === 1) {
                await Promise.race([secondRead.promise, Bun.sleep(1000)]);
            } else {
                secondRead.resolve();
            }
        }
        const response = await fake.fetch(input, init);
        if (body.includes('HausJoinTeam')) {
            const join = JSON.parse(body) as { variables: { input: { teamId: string } } };
            fake.joinFailures.add(join.variables.input.teamId);
        }
        return response;
    }) as typeof fetch;
}

async function members(credentialId: string) {
    const rows = await connection.db
        .select()
        .from(linearTeamAccessTable)
        .where(eq(linearTeamAccessTable.credentialId, credentialId));
    return Object.fromEntries(rows.map((row) => [row.teamId, row.member]));
}

test('an identity joins the Haus app’s member teams it may join, and no others', async () => {
    const { identity, seeded } = await world({
        // Ops refuses the identity; Legal accepts it but the Haus app is no member there.
        joinableTeamIds: [des.id, legal.id],
        teams: [des, ops, legal],
    });
    expect(await sync(seeded.workspaceId)).toEqual({ failed: 0, synced: 2 });
    // The workspace actor ran first, so its memberships were fresh for the join.
    expect(await members(seeded.credentialId)).toEqual({
        [des.id]: true,
        [legal.id]: false,
        [ops.id]: true,
    });
    expect(fake.joins).toEqual([
        { actorAppUserId: identity.appUserId, teamId: des.id, userId: identity.appUserId },
    ]);
    expect(await members(identity.credentialId)).toEqual({
        [des.id]: true,
        [legal.id]: false,
        [ops.id]: false,
    });
    const [view] = await listLinearIdentities(
        connection.db,
        { publicOrigin: 'https://app.haus.test' },
        { id: seeded.workspaceId, urlKey: 'haus' }
    );
    expect(view?.memberTeamIds).toEqual([des.id]);
    // A member is never re-joined.
    await sync(seeded.workspaceId);
    expect(fake.joins).toHaveLength(1);
});

test('a refused join is logged and the sync still succeeds', async () => {
    fake.joins.length = 0;
    fake.joinFailures.add(des.id);
    try {
        const { identity, seeded } = await world({ joinableTeamIds: [des.id], teams: [des] });
        expect(await sync(seeded.workspaceId)).toEqual({ failed: 0, synced: 2 });
        expect(fake.joins.map((join) => join.teamId)).toEqual([des.id]);
        expect(await members(identity.credentialId)).toEqual({ [des.id]: false });
    } finally {
        fake.joinFailures.clear();
    }
});

test('an identity install joins the Haus app’s member teams after the bind', async () => {
    fake.joins.length = 0;
    const { identity, seeded } = await world({ joinableTeamIds: [des.id], teams: [des] });
    await connection.db
        .update(linearTeamAccessTable)
        .set({ member: true })
        .where(eq(linearTeamAccessTable.credentialId, seeded.credentialId));
    await joinTeamsAfterIdentityInstall({
        appUserId: identity.appUserId,
        credentialId: identity.credentialId,
        db: connection.db,
        fetch: fake.fetch,
        now: new Date(),
        reach: [{ ...des, canJoin: true, member: false }],
        token: tokens.get(identity.credentialId) ?? '',
        workspaceId: seeded.workspaceId,
    });
    expect(fake.joins.map((join) => join.userId)).toEqual([identity.appUserId]);
    expect(await members(identity.credentialId)).toEqual({ [des.id]: true });
});

test('overlapping syncs for one identity join once and keep the member', async () => {
    fake.joins.length = 0;
    try {
        const { identity, seeded } = await world({ joinableTeamIds: [des.id], teams: [des] });
        // Unserialized, the second sync's read lands before the first sync's
        // join, so it joins again, is refused, and persists a stale non-member.
        const fetch = overlappingReads(tokens.get(identity.credentialId) ?? '');
        expect(
            await Promise.all([sync(seeded.workspaceId, fetch), sync(seeded.workspaceId, fetch)])
        ).toEqual([
            { failed: 0, synced: 2 },
            { failed: 0, synced: 2 },
        ]);
        expect(fake.joins.map((join) => join.teamId)).toEqual([des.id]);
        expect(await members(identity.credentialId)).toEqual({ [des.id]: true });
    } finally {
        fake.joinFailures.clear();
    }
});
