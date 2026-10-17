import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { linearLifecycleHandler } from '../src/linear/lifecycle-deliveries.ts';
import { startLinearAttempt } from '../src/linear/oauth-attempts.ts';
import { startLinearSweep, syncLinearTeams } from '../src/linear/team-sync.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    linearAgentLabelsTable,
    linearOauthAttemptsTable,
    linearTeamAccessTable,
} from '../src/postgres/schema.ts';
import { publishRealtime } from '../src/realtime/topic.ts';
import { linearUpdatedTopic } from '../src/realtime/topics.ts';
import { lockServerRow } from '../src/servers/server-lock.ts';
import permissionChange from './fixtures/linear/permission-change.json' with { type: 'json' };
import { deliveryRow, seedLinearSessionWorld } from './linear-session-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// The hourly Linear sweep (specs/linear-app.md#team-scope): every live actor's
// teams are re-read, a failure keeps the last set, and expired OAuth attempts go.

let cluster: PostgresCluster;
let connection: HausConnection;
const now = new Date('2026-10-15T12:00:00.000Z');
const stopWatching = new AbortController();
/** Every `linear.onUpdated` connection id published while the file runs. */
const updated: string[] = [];

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    void (async () => {
        try {
            for await (const { event } of linearUpdatedTopic.subscribe(stopWatching.signal)) {
                updated.push(event.connectionId);
            }
        } catch {
            // Aborted at teardown.
        }
    })();
});

afterAll(async () => {
    stopWatching.abort();
    await connection?.close();
    await cluster?.stop();
});

/** Linear's paged `teams` query, answering per token; a token in `failing` gets a 503. */
function fakeLinear(failing: ReadonlySet<string>) {
    return ((_url: string | URL | Request, init?: RequestInit) => {
        const token = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '') ?? '';
        if (failing.has(token)) {
            return Promise.resolve(new Response('unavailable', { status: 503 }));
        }
        const teams = [
            { id: 'team-des', key: 'DES', name: 'Design', viewerMembership: { id: 'mem-des' } },
            { id: 'team-ops', key: 'OPS', name: 'Operations', viewerMembership: null },
        ].map((team) => ({ ...team, viewerCanJoin: false }));
        // One team per page, so the sync must follow the cursor to see them all.
        const { variables } = JSON.parse(String(init?.body)) as {
            variables: { after: string | null };
        };
        const index = Number(variables.after ?? 0);
        const hasNextPage = index + 1 < teams.length;
        return Promise.resolve(
            Response.json({
                data: {
                    teams: {
                        nodes: [teams[index]],
                        pageInfo: {
                            endCursor: hasNextPage ? String(index + 1) : null,
                            hasNextPage,
                        },
                    },
                },
            })
        );
    }) as typeof fetch;
}

/** Subscribers read the topic through an async iterator, a macrotask behind a publish. */
function delivered() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

async function teamIds(credentialId: string) {
    const rows = await connection.db
        .select({ teamId: linearTeamAccessTable.teamId })
        .from(linearTeamAccessTable)
        .where(eq(linearTeamAccessTable.credentialId, credentialId));
    return rows.map((row) => row.teamId).sort();
}

test('the sweep re-reads every live actor and a failure keeps its last set', async () => {
    const synced = await seedLinearSessionWorld(connection.db);
    const failing = await seedLinearSessionWorld(connection.db);
    const outcome = await syncLinearTeams({
        accessToken: (credentialId) => Promise.resolve(`token-${credentialId}`),
        clock: { now: () => now },
        db: connection.db,
        fetch: fakeLinear(new Set([`token-${failing.credentialId}`])),
    });
    expect(outcome).toEqual({ failed: 1, synced: 1 });
    expect(await teamIds(synced.credentialId)).toEqual(['team-des', 'team-ops']);
    expect(await teamIds(failing.credentialId)).toEqual(['team-des']);
    // The workspace actor's new team gets pending Agent labels.
    const pending = await connection.db
        .select({ teamId: linearAgentLabelsTable.teamId })
        .from(linearAgentLabelsTable)
        .where(eq(linearAgentLabelsTable.workspaceId, synced.workspaceId));
    expect(pending.map((row) => row.teamId)).toContain('team-ops');
});

test('the sweep drops expired OAuth attempts and keeps live ones', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const attempt = (at: Date) =>
        startLinearAttempt(connection.db, {
            clientId: 'haus-app-client',
            now: at,
            redirectUri: 'https://app.haus.test/linear/oauth/callback',
            serverId: world.serverId,
            target: { purpose: 'workspace_install' },
            userId: world.ownerUserId,
        });
    await attempt(new Date(now.getTime() - 60 * 60_000));
    await attempt(now);
    const sweep = startLinearSweep(
        {
            accessToken: (credentialId) => Promise.resolve(`token-${credentialId}`),
            clock: { now: () => now },
            db: connection.db,
            fetch: fakeLinear(new Set()),
        },
        { clearInterval: () => undefined, setInterval: () => setTimeout(() => undefined, 0) }
    );
    await sweep.close();
    const left = await connection.db
        .select({ expiresAt: linearOauthAttemptsTable.expiresAt })
        .from(linearOauthAttemptsTable)
        .where(eq(linearOauthAttemptsTable.serverId, world.serverId));
    expect(left.map((row) => row.expiresAt.getTime() > now.getTime())).toEqual([true]);
});

test('a scoped sync re-reads one workspace and announces it to the Linear page', async () => {
    const target = await seedLinearSessionWorld(connection.db);
    const other = await seedLinearSessionWorld(connection.db);
    const outcome = await syncLinearTeams(
        {
            accessToken: (credentialId) => Promise.resolve(`token-${credentialId}`),
            clock: { now: () => now },
            db: connection.db,
            fetch: fakeLinear(new Set()),
        },
        { workspaceId: target.workspaceId }
    );
    expect(outcome).toEqual({ failed: 0, synced: 1 });
    await delivered();
    expect(await teamIds(target.credentialId)).toEqual(['team-des', 'team-ops']);
    expect(await teamIds(other.credentialId)).toEqual(['team-des']);
    expect(updated).toContain(target.connectionId);
    expect(updated).not.toContain(other.connectionId);
});

test('a PermissionChange delivery replaces team access and announces the workspace', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const handler = linearLifecycleHandler({
        accessToken: (credentialId) => Promise.resolve(`token-${credentialId}`),
        db: connection.db,
        fetch: fakeLinear(new Set()),
    });
    const row = deliveryRow(world, { body: permissionChange, event: 'PermissionChange' });
    const prepared = await handler.prepare?.(row);
    const outcome = await connection.db.transaction(async (tx) => {
        await lockServerRow(tx, world.serverId);
        return await handler.apply(tx, row, now, prepared);
    });
    expect(outcome.kind).toBe('done');
    if (outcome.kind !== 'done') {
        return;
    }
    expect(await teamIds(world.credentialId)).toEqual(['team-des', 'team-ops']);
    expect(updated).not.toContain(world.connectionId);
    // The worker publishes after commit.
    publishRealtime(outcome.announce);
    await delivered();
    expect(updated).toContain(world.connectionId);
});
