import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { linearDataChangeHandler } from '../src/linear/data-change.ts';
import type { Payload } from '../src/linear/delivery-payload.ts';
import { linearTriggerHandler } from '../src/linear/trigger-delivery.ts';
import { syncLinearTriggerProblems } from '../src/linear/trigger-problem-sync.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    agentInboxTable,
    agentMcpConnectionGrantsTable,
    linearTeamAccessTable,
    linearTriggerConfigsTable,
    linearWorkspacesTable,
    triggerFiresTable,
    triggersTable,
} from '../src/postgres/schema.ts';
import { setOperatorTriggerStatus } from '../src/triggers/operator-triggers.ts';
import { TriggerRateLimiter } from '../src/triggers/trigger-rate-limit.ts';
import { deliveryRow } from './linear-session-seed.ts';
import { captured, issueDelivery } from './linear-trigger-deliveries.ts';
import {
    clock,
    createLinearTrigger,
    fakeLinear,
    inboxDelivery,
    type LinearTriggerWorld,
    labels,
    opsTeamId,
    seedLinearTriggerWorld,
} from './linear-trigger-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// `linear` Trigger problems (specs/linear-triggers.md#failure-modes): derived
// most fundamental first, one notice per entry, silent clearing, no fires.

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

async function sync(references?: { complete: boolean; unavailable: Set<string> }) {
    return await connection.db.transaction((tx) =>
        syncLinearTriggerProblems(tx, {
            now: new Date(),
            references,
            scope: { workspaceId: world.workspaceId },
            serverId: world.serverId,
        })
    );
}

async function state(triggerId: string) {
    const [row] = await connection.db
        .select({ problem: linearTriggerConfigsTable.problem, version: triggersTable.version })
        .from(linearTriggerConfigsTable)
        .innerJoin(triggersTable, eq(triggersTable.id, linearTriggerConfigsTable.triggerId))
        .where(eq(linearTriggerConfigsTable.triggerId, triggerId));
    const notices = await connection.db
        .select({ content: agentInboxTable.content })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.serverId, world.serverId),
                eq(agentInboxTable.source, 'trigger_problem')
            )
        );
    return { ...row, notices: notices.map((notice) => notice.content) };
}

async function revokeGrant(agentId: string) {
    await connection.db
        .delete(agentMcpConnectionGrantsTable)
        .where(eq(agentMcpConnectionGrantsTable.agentId, agentId));
}

test('a revoked grant enters one problem with one notice; regranting clears it silently', async () => {
    const trigger = await createLinearTrigger(connection.db, world, {
        groups: [{ event: 'issue' }],
    });
    await revokeGrant(world.agents.juniper);
    const { entered } = await sync();
    expect(entered).toEqual([
        expect.objectContaining({ problem: 'agent_access_revoked', triggerId: trigger.id }),
    ]);
    expect(await sync()).toMatchObject({ entered: [] });
    const entering = await state(trigger.id);
    expect(entering).toMatchObject({
        problem: 'agent_access_revoked',
        version: trigger.version + 1,
    });
    expect(entering.notices).toHaveLength(1);
    expect(entering.notices[0]).toContain(
        `Your Linear Trigger ${trigger.id} stays armed but will not fire: you no longer have access to its Linear connection (problem=agent_access_revoked).`
    );
    await connection.db.insert(agentMcpConnectionGrantsTable).values({
        agentId: world.agents.juniper,
        connectionId: world.connectionId,
        serverId: world.serverId,
    });
    await sync();
    expect(await state(trigger.id)).toMatchObject({ notices: entering.notices, problem: null });
});

test('the most fundamental problem wins: removal, then sign-in, then grant, then teams', async () => {
    const trigger = await createLinearTrigger(connection.db, world, {
        groups: [{ event: 'issue', teams: ['OPS'] }],
    });
    await connection.db
        .delete(linearTeamAccessTable)
        .where(eq(linearTeamAccessTable.teamId, opsTeamId));
    await sync();
    expect((await state(trigger.id)).problem).toBe('teams_unavailable');
    await revokeGrant(world.agents.juniper);
    await sync();
    expect((await state(trigger.id)).problem).toBe('agent_access_revoked');
    await setWorkspace({ status: 'refresh_required' });
    await sync();
    expect((await state(trigger.id)).problem).toBe('sign_in_required');
    await setWorkspace({ connectionId: null, removedAt: new Date(), status: 'removed' });
    await sync();
    const removed = await state(trigger.id);
    expect(removed.problem).toBe('workspace_removed');
    expect(removed.notices).toHaveLength(4);
});

test('a removed label makes its Triggers unavailable until a complete sweep finds it again', async () => {
    const trigger = await createLinearTrigger(connection.db, world, {
        groups: [{ event: 'issue', labels: ['Bug'] }],
    });
    const untouched = await createLinearTrigger(connection.db, world, {
        groups: [{ event: 'issue' }],
    });
    const body = { ...captured('issue-label-update'), action: 'remove' } as Payload;
    await deliver({
        ...body,
        data: { ...(body.data as Payload), id: labels.bug },
        organizationId: world.organizationId,
    });
    expect((await state(trigger.id)).problem).toBe('references_unavailable');
    expect((await state(untouched.id)).problem).toBeNull();
    // A partial answer never clears it; a complete sweep does.
    await sync({ complete: false, unavailable: new Set() });
    expect((await state(trigger.id)).problem).toBe('references_unavailable');
    await sync({ complete: true, unavailable: new Set() });
    expect((await state(trigger.id)).problem).toBeNull();
});

test('a Trigger with a problem stays armed and does not fire; arming re-derives it', async () => {
    const trigger = await createLinearTrigger(connection.db, world, {
        groups: [{ actions: ['update'], event: 'issue' }],
    });
    await revokeGrant(world.agents.juniper);
    await deliver(issueDelivery(world, {}));
    const fires = await connection.db
        .select()
        .from(triggerFiresTable)
        .where(eq(triggerFiresTable.triggerId, trigger.id));
    expect(fires).toHaveLength(0);
    expect((await state(trigger.id)).problem).toBe('agent_access_revoked');
    const input = {
        origin: 'https://app.haus.test',
        serverId: world.serverId,
        triggerId: trigger.id,
    };
    await setOperatorTriggerStatus(
        connection.db,
        world.member,
        { ...input, status: 'disabled' },
        clock
    );
    await connection.db.insert(agentMcpConnectionGrantsTable).values({
        agentId: world.agents.juniper,
        connectionId: world.connectionId,
        serverId: world.serverId,
    });
    const armed = await setOperatorTriggerStatus(
        connection.db,
        world.member,
        { ...input, status: 'armed' },
        clock
    );
    expect(armed.entered).toEqual([]);
    expect(armed.trigger.kind === 'linear' && armed.trigger.linear.problem).toBeNull();
});

async function deliver(body: Payload) {
    const handler = linearDataChangeHandler({
        appOrigin: 'https://app.haus.test',
        hooks: {
            triggers: linearTriggerHandler({
                accessToken: async () => 'linear-test-token',
                db: connection.db,
                delivery: inboxDelivery,
                fetch: fakeLinear(world),
                limiter: new TriggerRateLimiter(),
            }),
        },
    });
    const row = deliveryRow(world, { body, event: String(body.type) });
    return await connection.db.transaction((tx) => handler.apply(tx, row, new Date(), undefined));
}

async function setWorkspace(values: {
    connectionId?: null;
    removedAt?: Date;
    status: 'refresh_required' | 'removed';
}) {
    await connection.db
        .update(linearWorkspacesTable)
        .set(values)
        .where(eq(linearWorkspacesTable.id, world.workspaceId));
}
