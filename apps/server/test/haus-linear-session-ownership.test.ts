import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { LinearDeliveryRow } from '../src/linear/delivery-handler.ts';
import { linearSessionHandler } from '../src/linear/session-routing.ts';
import { orphanLinearSessions } from '../src/linear/sessions.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentMcpConnectionGrantsTable, linearWorkspacesTable } from '../src/postgres/schema.ts';
import {
    linearSessionEventAt as now,
    sessionEvent,
    sessionFor,
    unreadIssueLabels,
} from './linear-session-events.ts';
import {
    deliveryRow,
    inboxRows,
    outboxRows,
    seedLinearIdentity,
    seedLinearSessionWorld,
} from './linear-session-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Session ownership (specs/linear-app.md#linear-sessions): identity sessions,
// automated sessions, grants, orphaning, and unknown actions.

let cluster: PostgresCluster;
let connection: HausConnection;
const handler = linearSessionHandler({
    appOrigin: 'https://app.haus.test',
    readIssueLabels: unreadIssueLabels,
});

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

/** Routes as the worker does after `prepare` read the issue's label ids. */
async function route(row: LinearDeliveryRow, labelIds: string[] = []) {
    return await connection.db.transaction((tx) => handler.apply(tx, row, now, { labelIds }));
}

test('an identity session belongs to its Agent and acks as the identity', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const identity = await seedLinearIdentity(connection.db, world, world.agents.juniper);
    await route(
        deliveryRow(world, {
            body: {
                ...sessionEvent(world, { prompt: 'Beacon please' }),
                appUserId: identity.appUserId,
            },
            event: 'AgentSessionEvent',
            receiver: identity.identityId,
        })
    );
    expect(await sessionFor(connection.db, world)).toMatchObject({
        agentId: world.agents.juniper,
        identityId: identity.identityId,
    });
    const [ack] = await outboxRows(connection.db, world.workspaceId);
    expect(ack?.credentialId).toBe(identity.credentialId);
});

test('a session another Agent’s write started is automated', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const identity = await seedLinearIdentity(connection.db, world, world.agents.beacon);
    await route(
        deliveryRow(world, {
            body: sessionEvent(world, { creatorId: identity.appUserId }),
            event: 'AgentSessionEvent',
        }),
        [world.labels.juniper]
    );
    const [item] = await inboxRows(connection.db, world.serverId);
    expect(item?.source).toBe('linear_session_automated');
});

test('an Agent without the grant gets no row; an orphaned session answers with an error', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    await connection.db
        .delete(agentMcpConnectionGrantsTable)
        .where(eq(agentMcpConnectionGrantsTable.agentId, world.agents.juniper));
    // A stale default still names the Agent; its label no longer routes.
    await connection.db
        .update(linearWorkspacesTable)
        .set({ defaultAgentId: world.agents.juniper })
        .where(eq(linearWorkspacesTable.id, world.workspaceId));
    await route(
        deliveryRow(world, {
            body: sessionEvent(world),
            event: 'AgentSessionEvent',
        }),
        [world.labels.juniper]
    );
    expect(await inboxRows(connection.db, world.serverId)).toEqual([]);
    const [refusal] = await outboxRows(connection.db, world.workspaceId);
    expect(refusal).toMatchObject({ input: { type: 'error' }, kind: 'session_activity' });

    const orphaned = await seedLinearSessionWorld(connection.db);
    const linearSessionId = crypto.randomUUID();
    await route(
        deliveryRow(orphaned, {
            body: sessionEvent(orphaned, { linearSessionId }),
            event: 'AgentSessionEvent',
        }),
        [orphaned.labels.beacon]
    );
    await connection.db.transaction((tx) =>
        orphanLinearSessions(tx, {
            agentId: orphaned.agents.beacon,
            now,
            serverId: orphaned.serverId,
        })
    );
    // Orphaning retired the queued row.
    expect(await inboxRows(connection.db, orphaned.serverId)).toEqual([]);
    await route(
        deliveryRow(orphaned, {
            body: sessionEvent(orphaned, { action: 'prompted', linearSessionId, prompt: 'hello?' }),
            event: 'AgentSessionEvent',
        })
    );
    expect(await inboxRows(connection.db, orphaned.serverId)).toEqual([]);
    const last = (await outboxRows(connection.db, orphaned.workspaceId)).at(-1);
    expect(last).toMatchObject({ input: { type: 'error' }, kind: 'session_activity' });
    expect(String((last?.input as { body: string }).body)).toContain('no longer available in Haus');
});

test('an unrecognised session action is ignored', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const body = { ...sessionEvent(world), action: 'stopped' };
    expect(await route(deliveryRow(world, { body, event: 'AgentSessionEvent' }))).toEqual({
        kind: 'ignored',
        reason: 'unsupported_event',
    });
});
