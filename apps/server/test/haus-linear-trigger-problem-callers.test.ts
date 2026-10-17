import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { linearConnection } from '../src/linear/linear-connection.ts';
import { sweepLinearTriggerReferences } from '../src/linear/reference-sweep.ts';
import { applyLinearTeamAccess } from '../src/linear/team-sync.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    linearCredentialsTable,
    linearTriggerConfigsTable,
} from '../src/postgres/schema.ts';
import { desTeamId } from './linear-session-seed.ts';
import {
    createLinearTrigger,
    type LinearTriggerWorld,
    labels,
    linearCatalog,
    seedLinearTriggerWorld,
} from './linear-trigger-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Who re-derives `linear` Trigger problems (specs/linear-triggers.md#failure-modes):
// the connection's lifecycle hooks, team syncs, and the hourly reference sweep.

let cluster: PostgresCluster;
let connection: HausConnection;
let world: LinearTriggerWorld;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

beforeEach(async () => {
    world = await seedLinearTriggerWorld(connection.db);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

async function problemOf(triggerId: string) {
    const [row] = await connection.db
        .select({ problem: linearTriggerConfigsTable.problem })
        .from(linearTriggerConfigsTable)
        .where(eq(linearTriggerConfigsTable.triggerId, triggerId));
    return row?.problem ?? null;
}

/** The Trigger catalog, optionally without the team's Bug label. */
function catalogFetch(options: { withoutBug?: boolean } = {}): typeof fetch {
    return (() => {
        const catalog = linearCatalog(world);
        if (options.withoutBug) {
            catalog.issueLabels.nodes = catalog.issueLabels.nodes.filter(
                (label) => label.id !== labels.bug
            );
        }
        return Promise.resolve(Response.json({ data: catalog }));
    }) as unknown as typeof fetch;
}

test('revoking a grant enters agent_access_revoked through the connection hook', async () => {
    const trigger = await createLinearTrigger(connection.db, world, {
        groups: [{ event: 'issue' }],
    });
    const key = {
        agentId: world.agents.juniper,
        connectionId: world.connectionId,
        serverId: world.serverId,
    };
    await connection.db.transaction(async (tx) => {
        await tx
            .delete(agentMcpConnectionGrantsTable)
            .where(eq(agentMcpConnectionGrantsTable.agentId, key.agentId));
        await linearConnection.agentGrantRemoved?.(tx, key);
    });
    expect(await problemOf(trigger.id)).toBe('agent_access_revoked');
});

test('a team sync that loses a Trigger team enters teams_unavailable and wakes its owner', async () => {
    const trigger = await createLinearTrigger(connection.db, world, {
        groups: [{ event: 'issue', teams: ['OPS'] }],
    });
    const [credential] = await connection.db
        .select()
        .from(linearCredentialsTable)
        .where(eq(linearCredentialsTable.id, world.credentialId));
    if (!credential) {
        throw new Error('The workspace credential was not seeded.');
    }
    const wakes = await connection.db.transaction((tx) =>
        applyLinearTeamAccess(
            tx,
            credential,
            [{ id: desTeamId, key: 'DES', member: false, name: 'Design' }],
            new Date()
        )
    );
    expect(await problemOf(trigger.id)).toBe('teams_unavailable');
    expect(wakes).toEqual([{ agentId: world.agents.juniper, serverId: world.serverId }]);
});

test('the reference sweep marks a vanished label unavailable and clears it once listed again', async () => {
    const trigger = await createLinearTrigger(connection.db, world, {
        groups: [{ event: 'issue', labels: ['Bug'] }],
    });
    const woken: unknown[] = [];
    const sweep = (fetch: typeof globalThis.fetch) =>
        sweepLinearTriggerReferences({
            accessToken: () => Promise.resolve('linear-test-token'),
            clock: { now: () => new Date() },
            db: connection.db,
            fetch,
            wake: (wakes) => woken.push(...wakes),
        });
    await sweep(catalogFetch({ withoutBug: true }));
    expect(await problemOf(trigger.id)).toBe('references_unavailable');
    expect(woken).toContainEqual({ agentId: world.agents.juniper, serverId: world.serverId });
    await sweep(catalogFetch());
    expect(await problemOf(trigger.id)).toBeNull();
});
