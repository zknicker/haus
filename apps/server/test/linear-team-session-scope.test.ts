import { afterAll, beforeAll, expect, test } from 'bun:test';
import { linearSessionHandler } from '../src/linear/session-routing.ts';
import { applyLinearTeamAccess } from '../src/linear/team-sync.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    linearSessionEventAt as now,
    sessionEvent,
    sessionFor,
    unreadIssueLabels,
} from './linear-session-events.ts';
import {
    deliveryRow,
    desTeamId,
    inboxRows,
    type LinearSessionWorld,
    seedLinearIdentity,
    seedLinearSessionWorld,
} from './linear-session-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Team scope (specs/linear-app.md#team-scope): a team access change orphans
// identity sessions whose issue team left the identity's effective access.

let cluster: PostgresCluster;
let connection: HausConnection;
const handler = linearSessionHandler({
    appOrigin: 'https://app.haus.test',
    readIssueLabels: unreadIssueLabels,
});
const des = { id: desTeamId, key: 'DES', member: false, name: 'Design' };
const ops = { id: 'team-ops', key: 'OPS', member: false, name: 'Ops' };

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

/** Juniper's identity holds an open session on DES-142 with a queued row. */
async function identityWorking() {
    const world = await seedLinearSessionWorld(connection.db);
    const identity = await seedLinearIdentity(connection.db, world, world.agents.juniper);
    const row = deliveryRow(world, {
        body: { ...sessionEvent(world, { prompt: 'take a look' }), appUserId: identity.appUserId },
        event: 'AgentSessionEvent',
        receiver: identity.identityId,
    });
    await connection.db.transaction((tx) => handler.apply(tx, row, now, { labelIds: null }));
    expect(await sessionFor(connection.db, world)).toMatchObject({ status: 'active' });
    return { identity, world };
}

function apply(
    world: LinearSessionWorld,
    credential: { id: string; identityId: string | null },
    teams: (typeof des)[]
) {
    return connection.db.transaction((tx) =>
        applyLinearTeamAccess(
            tx,
            { ...credential, serverId: world.serverId, workspaceId: world.workspaceId },
            teams,
            now
        )
    );
}

test('an identity losing the issue’s team orphans its session and retires its rows', async () => {
    const { identity, world } = await identityWorking();
    // Keeping the team leaves the session alone.
    await apply(world, { id: identity.credentialId, identityId: identity.identityId }, [des, ops]);
    expect(await sessionFor(connection.db, world)).toMatchObject({ status: 'active' });
    await apply(world, { id: identity.credentialId, identityId: identity.identityId }, [ops]);
    expect(await sessionFor(connection.db, world)).toMatchObject({ status: 'orphaned' });
    expect(await inboxRows(connection.db, world.serverId)).toEqual([]);
});

test('the workspace losing the team narrows effective access and orphans the session too', async () => {
    const { world } = await identityWorking();
    await apply(world, { id: world.credentialId, identityId: null }, [ops]);
    expect(await sessionFor(connection.db, world)).toMatchObject({ status: 'orphaned' });
});
