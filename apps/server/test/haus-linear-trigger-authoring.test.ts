import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    linearTriggerConfigsTable,
    linearWorkspacesTable,
} from '../src/postgres/schema.ts';
import { previewLinearTrigger } from '../src/triggers/linear-trigger-preview.ts';
import { updateOperatorTrigger } from '../src/triggers/operator-triggers.ts';
import { readTrigger } from '../src/triggers/trigger-queries.ts';
import { desTeamId } from './linear-session-seed.ts';
import { issueDelivery } from './linear-trigger-deliveries.ts';
import {
    authoringServices,
    clock,
    createLinearTrigger,
    fakeLinear,
    type LinearTriggerWorld,
    labels,
    opsTeamId,
    people,
    projectId,
    projectUrl,
    seedLinearTriggerWorld,
    states,
} from './linear-trigger-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Authoring `linear` Triggers (specs/linear-triggers.md#authoring): names
// resolve to stable ids before the transaction, ambiguity and absence are
// refusals, the workspace cap holds, and preview runs the delivery matcher.

let cluster: PostgresCluster;
let connection: HausConnection;
let world: LinearTriggerWorld;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    world = await seedLinearTriggerWorld(connection.db);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

test('names, keys, URLs, emails, and selectors are stored as stable ids', async () => {
    const trigger = await createLinearTrigger(connection.db, world, {
        groups: [
            {
                actions: ['update'],
                assignees: ['SAM.A@example.com'],
                delegates: ['@self'],
                event: 'issue',
                labels: ['Bug'],
                projects: [projectUrl],
                stateTo: ['changes requested'],
                teams: ['des'],
            },
            {
                actorsIgnore: [`@agent:${world.handles.beacon}`, 'sam.b@example.com'],
                event: 'comment',
                onIssueDelegatedTo: ['@self'],
            },
        ],
    });
    expect(trigger.linear.groups).toEqual([
        {
            actions: ['update'],
            assignees: [people.samA],
            delegates: [{ agent: world.agents.juniper }],
            event: 'issue',
            labels: [labels.bug],
            projects: [projectId],
            stateTo: [states.changesRequested],
            teams: [desTeamId],
        },
        {
            actions: ['create'],
            actorsIgnore: [{ agent: world.agents.beacon }, { linearUser: people.samB }],
            event: 'comment',
            onIssueDelegatedTo: [{ agent: world.agents.juniper }],
        },
    ]);
    expect(trigger.linear).toMatchObject({
        connectionId: world.connectionId,
        display: {
            [desTeamId]: 'DES',
            [labels.bug]: 'Bug',
            [projectId]: 'Atlas',
            [states.changesRequested]: 'Changes Requested',
            [world.agents.juniper]: `@${world.handles.juniper}`,
        },
        problem: null,
        selfSuppressedCount: 0,
        suppressedCount: 0,
        workspaceName: 'Haus',
    });
});

test('a team label wins over a workspace label; without teams a state name in two teams is ambiguous', async () => {
    const workspaceWide = await createLinearTrigger(connection.db, world, {
        groups: [{ event: 'issue', labels: ['bug'] }],
    });
    // Both DES and OPS are in scope, and DES has a team label named Bug.
    expect(workspaceWide.linear.groups[0]?.labels).toEqual([labels.bug]);
    await expect(
        createLinearTrigger(connection.db, world, {
            groups: [{ event: 'issue', stateTo: ['Design Review'] }],
        })
    ).rejects.toThrow(
        /linear_reference_ambiguous: "Design Review" names 2 workflow states: Design Review \((DES|OPS)\), Design Review \((DES|OPS)\)/u
    );
    const scoped = await createLinearTrigger(connection.db, world, {
        groups: [{ event: 'issue', stateTo: ['Design Review'], teams: ['OPS'] }],
    });
    expect(scoped.linear.groups[0]).toMatchObject({
        stateTo: [states.opsReview],
        teams: [opsTeamId],
    });
});

test('ambiguous users, unknown objects, teams outside access, and ungranted Agents are refused', async () => {
    const refusal = (groups: unknown[]) => createLinearTrigger(connection.db, world, { groups });
    await expect(refusal([{ assignees: ['Sam'], event: 'issue' }])).rejects.toThrow(
        /^linear_reference_ambiguous: "Sam" names 2 Linear users/u
    );
    await expect(refusal([{ event: 'issue', labels: ['Nope'] }])).rejects.toThrow(
        /^linear_reference_unavailable: No label named "Nope"/u
    );
    await expect(refusal([{ event: 'issue', teams: ['ENG'] }])).rejects.toThrow(
        /^linear_team_outside_access: Team "ENG"/u
    );
    await expect(refusal([{ delegates: ['@agent:nobody'], event: 'issue' }])).rejects.toThrow(
        /^linear_reference_unavailable: @agent:nobody/u
    );
});

test('the owner needs the grant and the workspace must be active', async () => {
    await connection.db
        .delete(agentMcpConnectionGrantsTable)
        .where(eq(agentMcpConnectionGrantsTable.agentId, world.agents.beacon));
    await expect(
        createLinearTrigger(connection.db, world, {
            agentId: world.agents.beacon,
            groups: [{ event: 'issue' }],
        })
    ).rejects.toThrow(/^linear_access_required:/u);
    await connection.db.insert(agentMcpConnectionGrantsTable).values({
        agentId: world.agents.beacon,
        connectionId: world.connectionId,
        serverId: world.serverId,
    });
    await setWorkspaceStatus('refresh_required');
    await expect(
        createLinearTrigger(connection.db, world, { groups: [{ event: 'issue' }] })
    ).rejects.toThrow(/^linear_workspace_unavailable:/u);
    await setWorkspaceStatus('active');
});

test('update replaces groups whole, clears a problem, and refuses a GitHub configuration', async () => {
    const trigger = await createLinearTrigger(connection.db, world, {
        groups: [{ event: 'issue' }],
    });
    await connection.db
        .update(linearTriggerConfigsTable)
        .set({ problem: 'references_unavailable', problemSince: new Date() })
        .where(eq(linearTriggerConfigsTable.triggerId, trigger.id));
    const input = {
        origin: 'https://app.haus.test',
        serverId: world.serverId,
        triggerId: trigger.id,
    };
    const services = authoringServices(connection.db, fakeLinear(world));
    const { trigger: updated } = await updateOperatorTrigger(
        connection.db,
        world.member,
        {
            ...input,
            linear: {
                connectionId: world.connectionId,
                groups: [
                    { actions: ['update'], event: 'project', projectStatuses: ['in progress'] },
                ],
            },
            title: 'Atlas progress',
        },
        clock,
        services
    );
    expect(updated).toMatchObject({
        kind: 'linear',
        linear: {
            groups: [
                { actions: ['update'], event: 'project', projectStatuses: ['status-started'] },
            ],
            problem: null,
        },
        title: 'Atlas progress',
        version: trigger.version + 1,
    });
    await expect(
        updateOperatorTrigger(
            connection.db,
            world.member,
            {
                ...input,
                github: {
                    events: [{ event: 'push' }],
                    installationId: 'ghi_nope',
                    repositories: { scope: 'installation' },
                },
            },
            clock,
            services
        )
    ).rejects.toThrow(/^trigger_kind_mismatch: A Linear Trigger has no GitHub configuration/u);
});

test('renames never affect matching: preview reads stored ids', async () => {
    const trigger = await createLinearTrigger(connection.db, world, {
        groups: [
            { actions: ['update'], event: 'issue', stateTo: ['Changes Requested'], teams: ['DES'] },
        ],
    });
    const preview = (payload: Record<string, unknown>) =>
        previewLinearTrigger(authoringServices(connection.db, fakeLinear(world)).linear, {
            now: new Date(),
            payload,
            serverId: world.serverId,
            trigger,
        });
    const body = issueDelivery(world, {});
    const data = body.data as Record<string, unknown>;
    expect(await preview(body)).toEqual({ groups: [0], matched: true });
    // Renamed in Linear after authoring: the id still matches.
    expect(
        await preview({
            ...body,
            data: {
                ...data,
                state: { id: states.changesRequested, name: 'Needs work', type: 'started' },
            },
        })
    ).toEqual({ groups: [0], matched: true });
    expect(await preview({ ...body, updatedFrom: { sortOrder: 1 } })).toEqual({
        groups: [],
        matched: false,
        reason: 'no_group_matched',
    });
    expect(await preview({ ...body, type: 'Reaction' })).toEqual({
        groups: [],
        matched: false,
        reason: 'unsupported_event',
    });
    const reread = await readTrigger(connection.db, {
        origin: 'https://app.haus.test',
        serverId: world.serverId,
        triggerId: trigger.id,
    });
    expect(reread.kind === 'linear' && reread.linear.suppressedCount).toBe(0);
});

test('a workspace holds at most 25 undeleted Linear Triggers', async () => {
    const [existing] = await connection.db
        .select({ triggerId: linearTriggerConfigsTable.triggerId })
        .from(linearTriggerConfigsTable)
        .where(eq(linearTriggerConfigsTable.workspaceId, world.workspaceId));
    expect(existing).toBeDefined();
    const count = await connection.db.$count(
        linearTriggerConfigsTable,
        and(eq(linearTriggerConfigsTable.workspaceId, world.workspaceId))
    );
    for (let index = count; index < 25; index += 1) {
        await createLinearTrigger(connection.db, world, {
            groups: [{ event: 'issue' }],
            title: `Filler ${index}`,
        });
    }
    await expect(
        createLinearTrigger(connection.db, world, { groups: [{ event: 'issue' }] })
    ).rejects.toThrow(/^linear_trigger_limit: The Haus workspace already has 25 Linear Triggers/u);
});

async function setWorkspaceStatus(status: 'active' | 'refresh_required') {
    await connection.db
        .update(linearWorkspacesTable)
        .set({ status })
        .where(eq(linearWorkspacesTable.id, world.workspaceId));
}
