import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { revokeLinearCredentials } from '../src/linear/credentials.ts';
import { enqueueLinearOutbox } from '../src/linear/outbox.ts';
import type { LinearOutboxTransport } from '../src/linear/outbox-calls.ts';
import { type LinearOutboxLane, runLinearOutboxBatch } from '../src/linear/outbox-worker.ts';
import { linearSessionHandler } from '../src/linear/session-routing.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { linearCredentialsTable, linearOutboxTable } from '../src/postgres/schema.ts';
import { linearSessionEventAt, sessionEvent, unreadIssueLabels } from './linear-session-events.ts';
import {
    deliveryRow,
    type LinearSessionWorld,
    linearTestRuntime,
    outboxRows,
    seedLinearSessionWorld,
} from './linear-session-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// How the outbox worker runs rows (specs/linear-app.md#linear-outbox): leases
// held per row, lanes that keep hand-backs off the acknowledgment path,
// `success: false` as a failure, token revokes, and idempotent session creates.

let cluster: PostgresCluster;
let connection: HausConnection;
const now = new Date('2026-10-15T11:59:00.000Z');

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

function run(
    lane: LinearOutboxLane,
    transport: LinearOutboxTransport,
    accessToken: (id: string) => Promise<string> = (id) => Promise.resolve(`token-for-${id}`)
) {
    return runLinearOutboxBatch({
        clock: { now: () => now },
        credentials: { accessToken },
        db: connection.db,
        lane,
        runtime: linearTestRuntime,
        transport,
    });
}

/** Linear answering every mutation `success: true`, recording what it was sent. */
function okLinear(onCall?: (query: string) => Promise<void>) {
    const queries: string[] = [];
    const transport: LinearOutboxTransport = {
        graphql: async (_token, query) => {
            queries.push(query);
            await onCall?.(query);
            if (query.includes('HausDelegatedIssues')) {
                return {
                    data: {
                        issues: { nodes: [], pageInfo: { endCursor: null, hasNextPage: false } },
                    },
                };
            }
            return { data: { result: { success: true } } };
        },
        revoke: () => Promise.resolve(),
    };
    return { queries, transport };
}

function enqueueActivity(world: LinearSessionWorld) {
    return connection.db.transaction((tx) =>
        enqueueLinearOutbox(
            tx,
            {
                credentialId: world.credentialId,
                input: { body: 'Working on it', linearSessionId: 'session-1', type: 'error' },
                kind: 'session_activity',
                serverId: world.serverId,
                workspaceId: world.workspaceId,
            },
            now
        )
    );
}

function enqueueHandBack(world: LinearSessionWorld) {
    return connection.db.transaction((tx) =>
        enqueueLinearOutbox(
            tx,
            {
                credentialId: world.credentialId,
                input: { delegateId: world.workspaceAppUserId, identityUserId: 'identity-user' },
                kind: 'identity_hand_back',
                serverId: world.serverId,
                workspaceId: world.workspaceId,
            },
            now
        )
    );
}

async function states(world: LinearSessionWorld) {
    const rows = await outboxRows(connection.db, world.workspaceId);
    return rows
        .map((row) => [row.kind, row.state, row.attempts])
        .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
}

test('a mutation answering success: false fails the row and retries it', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    await enqueueActivity(world);
    await run('calls', {
        graphql: () => Promise.resolve({ data: { agentActivityCreate: { success: false } } }),
        revoke: () => Promise.resolve(),
    });
    const [row] = await outboxRows(connection.db, world.workspaceId);
    expect(row).toMatchObject({ attempts: 1, state: 'queued' });
    expect(row?.lastError).toContain('agentActivityCreate with success: false');
});

test('a run that lost its lease leaves the row to the run that holds it', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    await enqueueActivity(world);
    const reclaimedAt = new Date(now.getTime() + 5 * 60_000);
    const linear = okLinear(async () => {
        // Another worker reclaims the row mid-call after this lease expired.
        await connection.db
            .update(linearOutboxTable)
            .set({ nextAttemptAt: reclaimedAt })
            .where(eq(linearOutboxTable.workspaceId, world.workspaceId));
    });
    await run('calls', linear.transport);
    const [row] = await outboxRows(connection.db, world.workspaceId);
    expect(row).toMatchObject({ attempts: 0, doneAt: null, state: 'queued' });
    expect(row?.nextAttemptAt).toEqual(reclaimedAt);
});

test('hand-backs run in their own lane, never ahead of or behind short calls', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    await enqueueHandBack(world);
    await enqueueActivity(world);
    await run('calls', okLinear().transport);
    expect(await states(world)).toEqual([
        ['identity_hand_back', 'queued', 0],
        ['session_activity', 'done', 0],
    ]);
    await run('hand_back', okLinear().transport);
    expect(await states(world)).toEqual([
        ['identity_hand_back', 'done', 0],
        ['session_activity', 'done', 0],
    ]);
});

test('a session_create whose session already arrived does not open another', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const enqueueCreate = () =>
        connection.db.transaction((tx) =>
            enqueueLinearOutbox(
                tx,
                {
                    credentialId: world.credentialId,
                    input: { externalUrls: [], issueId: 'issue-142' },
                    kind: 'session_create',
                    serverId: world.serverId,
                    workspaceId: world.workspaceId,
                },
                now
            )
        );
    await enqueueCreate();
    // The session Linear opened arrives before the worker records the call.
    const sessions = linearSessionHandler({
        appOrigin: 'https://app.haus.test',
        readIssueLabels: unreadIssueLabels,
    });
    const created = deliveryRow(world, {
        at: linearSessionEventAt,
        body: sessionEvent(world),
        event: 'AgentSessionEvent',
    });
    await connection.db.transaction((tx) =>
        sessions.apply(tx, created, linearSessionEventAt, {
            labelIds: [world.labels.juniper],
        })
    );
    const linear = okLinear();
    await run('calls', linear.transport);
    expect(linear.queries.filter((query) => query.includes('HausSessionCreate'))).toEqual([]);
    const rows = await outboxRows(connection.db, world.workspaceId);
    expect(rows.find((row) => row.kind === 'session_create')?.state).toBe('done');
});

test('a revoked credential’s token_revoke lands without its deleted credential', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const [credential] = await connection.db
        .select({ refreshToken: linearCredentialsTable.refreshToken })
        .from(linearCredentialsTable)
        .where(eq(linearCredentialsTable.id, world.credentialId));
    await connection.db.transaction((tx) =>
        revokeLinearCredentials(tx, { credentialIds: [world.credentialId], now })
    );
    const revoked: unknown[] = [];
    await run(
        'calls',
        {
            graphql: () => Promise.reject(new Error('no GraphQL for a revoke')),
            revoke: (input) => {
                revoked.push(input);
                return Promise.resolve();
            },
        },
        // As in production: the credential row is gone, so any token lookup fails.
        (id) => Promise.reject(new Error(`Linear credential ${id} not found`))
    );
    expect(revoked).toContainEqual({ clientId: null, token: credential?.refreshToken });
    const rows = await outboxRows(connection.db, world.workspaceId);
    expect(rows.map((row) => [row.kind, row.state, row.credentialId])).toEqual([
        ['token_revoke', 'done', null],
    ]);
});
