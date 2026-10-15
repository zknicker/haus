import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { linearDataChangeHandler } from '../src/linear/data-change.ts';
import type { LinearDeliveryRow } from '../src/linear/delivery-handler.ts';
import { handBackIdentityIssues } from '../src/linear/handoff.ts';
import type { LinearOutboxTransport } from '../src/linear/outbox-calls.ts';
import { runLinearOutboxBatch } from '../src/linear/outbox-worker.ts';
import { linearSessionHandler } from '../src/linear/session-routing.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { linearAgentSessionsTable, linearOutboxTable } from '../src/postgres/schema.ts';
import { unreadIssueLabels } from './linear-session-events.ts';
import {
    deliveryRow,
    desTeamId,
    inboxRows,
    type LinearSessionWorld,
    linearTestRuntime,
    outboxRows,
    seedLinearIdentity,
    seedLinearSessionWorld,
} from './linear-session-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Handoff (specs/linear-app.md#handoff): a person moving the Agent label or
// delegating to an identity hands the issue to another Agent.

let cluster: PostgresCluster;
let connection: HausConnection;
const appOrigin = 'https://app.haus.test';
const dataChange = linearDataChangeHandler({ appOrigin, hooks: {} });
const sessions = linearSessionHandler({ appOrigin, readIssueLabels: unreadIssueLabels });
const now = new Date('2026-10-15T12:00:00.000Z');

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

async function apply(handler: typeof dataChange, row: LinearDeliveryRow) {
    return await connection.db.transaction((tx) => handler.apply(tx, row, now, undefined));
}

async function applySession(row: LinearDeliveryRow, labelIds: string[]) {
    return await connection.db.transaction((tx) => sessions.apply(tx, row, now, { labelIds }));
}

/** Juniper holds an open session on DES-142, with a queued row for it. */
async function juniperWorking(world: LinearSessionWorld) {
    await applySession(
        deliveryRow(world, {
            at: now,
            body: {
                action: 'created',
                agentSession: {
                    creator: { id: 'human-1' },
                    id: crypto.randomUUID(),
                    issue: {
                        id: 'issue-142',
                        identifier: 'DES-142',
                        teamId: desTeamId,
                    },
                },
                organizationId: world.organizationId,
                type: 'AgentSessionEvent',
                webhookTimestamp: now.getTime(),
            },
            event: 'AgentSessionEvent',
        }),
        [world.labels.juniper]
    );
    await connection.db
        .delete(linearOutboxTable)
        .where(eq(linearOutboxTable.workspaceId, world.workspaceId));
}

function issueUpdate(
    world: LinearSessionWorld,
    input: {
        actorId?: string;
        delegateId?: string | null;
        labelIds?: string[];
        updatedFrom: Record<string, unknown>;
    }
) {
    return deliveryRow(world, {
        at: now,
        body: {
            action: 'update',
            actor: { id: input.actorId ?? 'human-1' },
            data: {
                delegateId: input.delegateId ?? null,
                id: 'issue-142',
                labelIds: input.labelIds ?? [world.labels.beacon],
                teamId: desTeamId,
                updatedAt: now.toISOString(),
            },
            organizationId: world.organizationId,
            type: 'Issue',
            updatedFrom: input.updatedFrom,
            webhookTimestamp: now.getTime(),
        },
        event: 'Issue',
    });
}

async function sessionStatuses(world: LinearSessionWorld) {
    return (
        await connection.db
            .select({
                agentId: linearAgentSessionsTable.agentId,
                status: linearAgentSessionsTable.status,
            })
            .from(linearAgentSessionsTable)
            .where(eq(linearAgentSessionsTable.workspaceId, world.workspaceId))
    ).map((row) => [row.agentId, row.status]);
}

test('a person moving the label hands off: sessions close and the delegate moves to B’s actor', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    await juniperWorking(world);
    expect(await inboxRows(connection.db, world.serverId)).toHaveLength(1);
    const outcome = await apply(
        dataChange,
        issueUpdate(world, { updatedFrom: { labelIds: [world.labels.juniper] } })
    );
    expect(outcome).toMatchObject({ kind: 'done', routed: 1 });
    expect(await sessionStatuses(world)).toEqual([[world.agents.juniper, 'handed_off']]);
    expect(await inboxRows(connection.db, world.serverId)).toEqual([]);
    const [route] = await outboxRows(connection.db, world.workspaceId);
    expect(route).toMatchObject({
        credentialId: world.credentialId,
        input: { delegateId: world.workspaceAppUserId, issueId: 'issue-142' },
        kind: 'issue_route',
    });
});

test('when the delegate already is B’s actor, Haus opens B’s session itself', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    await apply(
        dataChange,
        issueUpdate(world, {
            delegateId: world.workspaceAppUserId,
            updatedFrom: { labelIds: [world.labels.juniper] },
        })
    );
    const [create] = await outboxRows(connection.db, world.workspaceId);
    expect(create).toMatchObject({ input: { issueId: 'issue-142' }, kind: 'session_create' });
    expect(JSON.stringify(create?.input)).toContain(`${appOrigin}/s/`);
});

test('on an identity-capable team the delegate moves to B’s identity', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const identity = await seedLinearIdentity(connection.db, world, world.agents.beacon);
    await apply(
        dataChange,
        issueUpdate(world, {
            delegateId: world.workspaceAppUserId,
            updatedFrom: { labelIds: [world.labels.juniper] },
        })
    );
    const [route] = await outboxRows(connection.db, world.workspaceId);
    expect(route).toMatchObject({ input: { delegateId: identity.appUserId }, kind: 'issue_route' });
});

test('B’s own label write closes the old sessions but enqueues nothing for B', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const identity = await seedLinearIdentity(connection.db, world, world.agents.beacon);
    await juniperWorking(world);
    await apply(
        dataChange,
        issueUpdate(world, {
            actorId: identity.appUserId,
            updatedFrom: { labelIds: [world.labels.juniper] },
        })
    );
    expect(await sessionStatuses(world)).toEqual([[world.agents.juniper, 'handed_off']]);
    expect(await outboxRows(connection.db, world.workspaceId)).toEqual([]);
});

test('a person delegating to B’s identity applies B’s label', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const identity = await seedLinearIdentity(connection.db, world, world.agents.beacon);
    await apply(
        dataChange,
        issueUpdate(world, {
            delegateId: identity.appUserId,
            labelIds: [world.labels.juniper],
            updatedFrom: { delegateId: null },
        })
    );
    const [route] = await outboxRows(connection.db, world.workspaceId);
    expect(route).toMatchObject({
        input: { delegateId: null, labelId: world.labels.beacon },
        kind: 'issue_route',
    });
});

test('a change touching neither label nor delegate is no handoff', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    expect(
        await apply(dataChange, issueUpdate(world, { updatedFrom: { title: 'Old title' } }))
    ).toMatchObject({ kind: 'done', routed: 0 });
    expect(await outboxRows(connection.db, world.workspaceId)).toEqual([]);
});

test('identity removal hands open issues back to the Haus app through the outbox', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    await connection.db.transaction((tx) =>
        handBackIdentityIssues(tx, {
            identityUserId: 'identity-user',
            now,
            workspaceId: world.workspaceId,
        })
    );
    const calls: { query: string; variables: Record<string, unknown> }[] = [];
    const transport: LinearOutboxTransport = {
        graphql: (_token, query, variables) => {
            calls.push({ query, variables });
            if (!query.includes('HausDelegatedIssues')) {
                return Promise.resolve({ data: { issueUpdate: { success: true } } });
            }
            // Two pages: the hand-back follows the cursor rather than stopping at the first.
            const first = variables.after === null;
            return Promise.resolve({
                data: {
                    issues: {
                        nodes: [{ id: first ? 'issue-1' : 'issue-2' }],
                        pageInfo: { endCursor: first ? 'cursor-1' : null, hasNextPage: first },
                    },
                },
            });
        },
        revoke: () => Promise.reject(new Error('no revoke for a hand-back')),
    };
    await runLinearOutboxBatch({
        clock: { now: () => now },
        credentials: { accessToken: (id) => Promise.resolve(`token-for-${id}`) },
        db: connection.db,
        lane: 'hand_back',
        runtime: linearTestRuntime,
        transport,
    });
    const [row] = await outboxRows(connection.db, world.workspaceId);
    expect(row).toMatchObject({ kind: 'identity_hand_back', state: 'done' });
    // Other tests' worlds share the queue; only this world's calls name its app user.
    const mine = calls.filter(
        (call) =>
            call.variables.delegate === 'identity-user' ||
            (call.variables.input as { delegateId?: string } | undefined)?.delegateId ===
                world.workspaceAppUserId
    );
    expect(mine.map((call) => call.variables)).toEqual([
        { after: null, delegate: 'identity-user', first: 100 },
        { after: 'cursor-1', delegate: 'identity-user', first: 100 },
        { id: 'issue-1', input: { delegateId: world.workspaceAppUserId } },
        { id: 'issue-2', input: { delegateId: world.workspaceAppUserId } },
    ]);
});
