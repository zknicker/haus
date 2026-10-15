import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { LinearDeliveryRow } from '../src/linear/delivery-handler.ts';
import type { Payload } from '../src/linear/delivery-payload.ts';
import { stoppedSessionElicitation } from '../src/linear/session-activities.ts';
import { linearSessionIssueLabels } from '../src/linear/session-issue-labels.ts';
import { linearSessionHandler } from '../src/linear/session-routing.ts';
import { closeLinearSessions } from '../src/linear/sessions.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { linearAgentSessionsTable } from '../src/postgres/schema.ts';
import { sessionFor } from './linear-session-events.ts';
import {
    deliveryRow,
    inboxRows,
    type LinearSessionWorld,
    outboxRows,
    seedLinearSessionWorld,
} from './linear-session-seed.ts';
import { captured } from './linear-trigger-deliveries.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Session routing over the real captures (fixtures/linear/captured/): labels
// read from the issue, mention vs delegation from `sourceMetadata`, the stop
// signal (Q9), and prompts to closed sessions.

let cluster: PostgresCluster;
let connection: HausConnection;
const now = new Date('2026-10-15T16:52:00.000Z');
/** Issue id → label ids the fake Linear answers the session issue read with. */
const issueLabels = new Map<string, string[]>();
let issueReads = 0;

const fakeLinear = (async (_input: string | URL | Request, init?: RequestInit) => {
    issueReads += 1;
    const { variables } = JSON.parse(String(init?.body)) as { variables: { id: string } };
    const labels = issueLabels.get(variables.id);
    if (!labels) {
        return Response.json({ errors: [{ message: 'Entity not found' }] });
    }
    return Response.json({
        data: {
            issue: {
                assignee: null,
                delegate: null,
                id: variables.id,
                identifier: 'HTST-11',
                labels: { nodes: labels.map((id) => ({ id, name: id })) },
                project: null,
                state: null,
                team: { id: 'team-htst', key: 'HTST' },
                title: 'Fixture: design HTST',
                url: 'https://linear.app/haus-chat/issue/HTST-11',
            },
        },
    });
}) as typeof fetch;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

function handler() {
    return linearSessionHandler({
        appOrigin: 'https://app.haus.test',
        readIssueLabels: linearSessionIssueLabels({
            accessToken: () => Promise.resolve('workspace-token'),
            db: connection.db,
            fetch: fakeLinear,
        }),
    });
}

/** A captured session event, moved into the seeded workspace. */
function capturedRow(world: LinearSessionWorld, name: string): LinearDeliveryRow {
    const body = captured(name);
    return deliveryRow(world, {
        at: now,
        body: {
            ...body,
            appUserId: world.workspaceAppUserId,
            organizationId: world.organizationId,
        },
        event: 'AgentSessionEvent',
    });
}

/** Runs the handler as the worker does: `prepare` outside, `apply` in a transaction. */
async function route(row: LinearDeliveryRow) {
    const sessions = handler();
    const prepared = await sessions.prepare?.(row);
    return await connection.db.transaction((tx) => sessions.apply(tx, row, now, prepared));
}

function issueId(name: string): string {
    return String((captured(name).agentSession as Payload).issueId);
}

test('a delegation routes by the issue’s Agent label, read from Linear, not by its placeholder', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    issueLabels.set(issueId('agent-session-created-delegation'), ['label-x', world.labels.beacon]);
    const outcome = await route(capturedRow(world, 'agent-session-created-delegation'));
    expect(outcome).toMatchObject({ kind: 'done', routed: 1 });
    expect((await sessionFor(connection.db, world))?.agentId).toBe(world.agents.beacon);
    const [item] = await inboxRows(connection.db, world.serverId);
    expect(item?.content).toContain('· delegated · Beacon');
    expect(item?.content).not.toContain('This thread is for an agent session');
});

test('a captured mention is a mention and still routes by label when it names no handle', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    issueLabels.set(issueId('agent-session-created-mention'), [world.labels.juniper]);
    await route(capturedRow(world, 'agent-session-created-mention'));
    const [item] = await inboxRows(connection.db, world.serverId);
    expect(item?.agentId).toBe(world.agents.juniper);
    expect(item?.content).toContain('· mentioned · Juniper');
});

test('without a workspace token the promptContext label names route instead', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const reads = issueReads;
    const row = capturedRow(world, 'agent-session-created-delegation');
    const outcome = await connection.db.transaction((tx) =>
        handler().apply(tx, row, now, { labelIds: null })
    );
    expect(outcome).toMatchObject({ kind: 'done', routed: 1 });
    expect(issueReads).toBe(reads);
    // `<label>Agent › Juniper</label>` names Juniper.
    expect((await sessionFor(connection.db, world))?.agentId).toBe(world.agents.juniper);
});

test('a failed issue read throws so the delivery retries', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const row = capturedRow(world, 'agent-session-created-proactive');
    await expect(handler().prepare?.(row)).rejects.toThrow();
});

test('the stop signal closes the session stopped and retires its queued row', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    issueLabels.set(issueId('agent-session-created-mention'), [world.labels.juniper]);
    await route(capturedRow(world, 'agent-session-created-mention'));
    expect(await inboxRows(connection.db, world.serverId)).toHaveLength(1);
    const reads = issueReads;
    const outcome = await route(capturedRow(world, 'agent-session-prompted-stop'));
    expect(outcome).toEqual({ announce: [], kind: 'done', routed: 0, wakes: [] });
    expect(issueReads).toBe(reads);
    expect(await sessionFor(connection.db, world)).toMatchObject({ status: 'stopped' });
    expect(await inboxRows(connection.db, world.serverId)).toEqual([]);
    expect((await outboxRows(connection.db, world.workspaceId)).map((row) => row.kind)).toEqual([
        'session_ack',
    ]);
});

test('a prompt to a stopped or handed-off session explains instead of waking anyone', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const id = issueId('agent-session-prompted');
    issueLabels.set(id, [world.labels.juniper]);
    await route(capturedRow(world, 'agent-session-created-proactive'));
    const session = await sessionFor(connection.db, world);
    await connection.db.transaction((tx) =>
        closeLinearSessions(tx, {
            now,
            serverId: world.serverId,
            status: 'stopped',
            where: { sessionIds: [session?.id ?? ''] },
        })
    );
    const stopped = await route(capturedRow(world, 'agent-session-prompted'));
    expect(stopped).toMatchObject({ kind: 'done', routed: 0, wakes: [] });
    expect((await outboxRows(connection.db, world.workspaceId)).at(-1)?.input).toMatchObject({
        body: stoppedSessionElicitation,
        type: 'elicitation',
    });

    // Handed off to Beacon, who now holds an open session on the issue.
    await connection.db
        .update(linearAgentSessionsTable)
        .set({ status: 'handed_off' })
        .where(eq(linearAgentSessionsTable.id, session?.id ?? ''));
    await connection.db.insert(linearAgentSessionsTable).values({
        ...(session as typeof linearAgentSessionsTable.$inferInsert),
        agentId: world.agents.beacon,
        id: 'lss_beaconbeacon0001',
        linearSessionId: crypto.randomUUID(),
        status: 'active',
    });
    await route(capturedRow(world, 'agent-session-prompted'));
    expect(await inboxRows(connection.db, world.serverId)).toEqual([]);
    const last = (await outboxRows(connection.db, world.workspaceId)).at(-1);
    expect(last?.input).toMatchObject({ type: 'elicitation' });
    expect(String((last?.input as { body: string }).body)).toContain('handed off to Beacon');
});
