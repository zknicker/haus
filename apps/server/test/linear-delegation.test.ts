import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { resolveDelegation } from '../src/linear/delegation.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentMcpConnectionGrantsTable, agentsTable } from '../src/postgres/schema.ts';
import { agentHandle } from './linear-session-events.ts';
import {
    desTeamId,
    type LinearSessionWorld,
    seedLinearSessionWorld,
} from './linear-session-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// `delegate_issue` targets (specs/linear-app.md#tools): the Agent names a Haus
// Agent by display name, handle, or id; the Server resolves it among the
// Agents granted this connection.

let cluster: PostgresCluster;
let connection: HausConnection;
let world: LinearSessionWorld;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    world = await seedLinearSessionWorld(connection.db);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

function delegate(target: unknown, scope: LinearSessionWorld = world) {
    return resolveDelegation(connection.db, {
        connectionId: scope.connectionId,
        issueTeamId: desTeamId,
        now: new Date(),
        serverId: scope.serverId,
        target,
        workspace: { appUserId: scope.workspaceAppUserId, id: scope.workspaceId },
    });
}

test('a display name, handle, or id names the granted Agent, ignoring case', async () => {
    const expected = {
        delegation: {
            delegateId: world.workspaceAppUserId,
            labelGroupId: null,
            labelId: world.labels.beacon,
        },
    };
    const handle = await agentHandle(connection.db, world.agents.beacon);
    expect(await delegate('beacon')).toEqual(expected);
    expect(await delegate(' BEACON ')).toEqual(expected);
    expect(await delegate(`@${handle.toUpperCase()}`)).toEqual(expected);
    expect(await delegate(world.agents.beacon)).toEqual(expected);
});

test('an unknown, ungranted, or ambiguous name refuses with the names it may use', async () => {
    const scope = await seedLinearSessionWorld(connection.db);
    const refusal = await delegate('Nobody', scope);
    expect(refusal).toMatchObject({ refused: 'linear_agent_unknown' });
    const detail = 'detail' in refusal ? String(refusal.detail) : '';
    expect(detail).toContain('"Nobody" names no Agent with Linear');
    expect(detail).toContain('Beacon (@');
    expect(detail).toContain('Juniper (@');

    await connection.db
        .delete(agentMcpConnectionGrantsTable)
        .where(eq(agentMcpConnectionGrantsTable.agentId, scope.agents.juniper));
    expect(await delegate('Juniper', scope)).toMatchObject({ refused: 'linear_agent_unknown' });
    expect(await delegate(scope.agents.juniper, scope)).toMatchObject({
        refused: 'linear_agent_unknown',
    });

    const [beacon] = await connection.db
        .select()
        .from(agentsTable)
        .where(eq(agentsTable.id, scope.agents.beacon));
    const twinId = createOpaqueId('agt');
    await connection.db.insert(agentsTable).values({
        ...(beacon as typeof agentsTable.$inferInsert),
        handle: `beacon-twin-${twinId.slice(-6).toLowerCase()}`,
        id: twinId,
    });
    await connection.db
        .insert(agentMcpConnectionGrantsTable)
        .values({ agentId: twinId, connectionId: scope.connectionId, serverId: scope.serverId });
    const ambiguous = await delegate('Beacon', scope);
    expect(ambiguous).toMatchObject({ refused: 'linear_agent_unknown' });
    expect('detail' in ambiguous ? ambiguous.detail : '').toContain('names more than one Agent');
});
