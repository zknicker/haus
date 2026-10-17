import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { labelLifecycle } from '../src/linear/label-lifecycle.ts';
import { enqueueLinearOutbox } from '../src/linear/outbox.ts';
import type { LinearOutboxTransport } from '../src/linear/outbox-calls.ts';
import { linearOutboxMaxAttempts, runLinearOutboxBatch } from '../src/linear/outbox-worker.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    linearAgentLabelsTable,
    linearLabelGroupsTable,
} from '../src/postgres/schema.ts';
import {
    type LinearSessionWorld,
    linearTestRuntime,
    outboxRows,
    seedLinearSessionWorld,
} from './linear-session-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// The Linear outbox (specs/linear-app.md#linear-outbox) over a fake Linear that
// remembers client ids: retries never duplicate, acknowledgments go first,
// and Agent labels follow grants (specs/linear-app.md#agent-labels-and-delegation).

let cluster: PostgresCluster;
let connection: HausConnection;
let now = new Date('2026-10-15T12:00:00.000Z');

interface Call {
    query: string;
    variables: Record<string, unknown>;
}

/** Linear as the outbox sees it: creates keyed by client id, plus scripted failures. */
function fakeLinear(
    options: { failNext?: number; loseAnswers?: number; nameTaken?: string[] } = {}
) {
    const calls: Call[] = [];
    const created = new Set<string>();
    let failNext = options.failNext ?? 0;
    let loseAnswers = options.loseAnswers ?? 0;
    const transport: LinearOutboxTransport = {
        graphql: (_token, query, variables) => {
            calls.push({ query, variables });
            if (failNext > 0) {
                failNext -= 1;
                return Promise.reject(new Error('Linear answered 503'));
            }
            const input = (variables.input ?? {}) as { id?: string; name?: string };
            if (input.name && options.nameTaken?.includes(input.name)) {
                return Promise.resolve({
                    errors: [{ message: 'Label name already exists in team' }],
                });
            }
            if (input.id) {
                if (created.has(input.id)) {
                    return Promise.resolve({
                        errors: [{ message: `Entity with id ${input.id} already exists` }],
                    });
                }
                created.add(input.id);
            }
            if (loseAnswers > 0) {
                loseAnswers -= 1;
                return Promise.reject(new Error('socket hang up'));
            }
            return Promise.resolve({ data: { ok: true } });
        },
        revoke: () => Promise.resolve(),
    };
    return { calls, created, transport };
}

function run(transport: LinearOutboxTransport) {
    return runLinearOutboxBatch({
        clock: { now: () => now },
        credentials: { accessToken: (id) => Promise.resolve(`token-for-${id}`) },
        db: connection.db,
        lane: 'calls',
        runtime: linearTestRuntime,
        transport,
    });
}

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

async function seed() {
    return await seedLinearSessionWorld(connection.db);
}

async function enqueueActivity(
    world: LinearSessionWorld,
    kind: 'session_activity' | 'session_ack'
) {
    return await connection.db.transaction((tx) =>
        kind === 'session_ack'
            ? enqueueLinearOutbox(
                  tx,
                  {
                      credentialId: world.credentialId,
                      input: {
                          body: 'Juniper is on it',
                          externalUrls: [
                              { label: 'Open in Haus', url: 'https://app.haus.test/s/x' },
                          ],
                          linearSessionId: 'session-1',
                          sessionRowId: 'lss_none',
                      },
                      kind,
                      serverId: world.serverId,
                      workspaceId: world.workspaceId,
                  },
                  now
              )
            : enqueueLinearOutbox(
                  tx,
                  {
                      credentialId: world.credentialId,
                      input: {
                          body: 'No Agent is assigned.',
                          linearSessionId: 'session-1',
                          type: 'elicitation',
                      },
                      kind,
                      serverId: world.serverId,
                      workspaceId: world.workspaceId,
                  },
                  now
              )
    );
}

test('a lost answer retries with the same client id and Linear’s duplicate counts as done', async () => {
    const world = await seed();
    const id = await enqueueActivity(world, 'session_activity');
    const linear = fakeLinear({ loseAnswers: 1 });
    await run(linear.transport);
    const [afterCrash] = await outboxRows(connection.db, world.workspaceId);
    expect(afterCrash).toMatchObject({ attempts: 1, id, state: 'queued' });
    now = new Date(now.getTime() + 2000);
    await run(linear.transport);
    const [done] = await outboxRows(connection.db, world.workspaceId);
    expect(done?.state).toBe('done');
    const ids = linear.calls.map((call) => (call.variables.input as { id: string }).id);
    expect(ids).toEqual([done?.clientId, done?.clientId]);
    expect(linear.created.size).toBe(1);
});

test('acknowledgments run before older rows', async () => {
    const world = await seed();
    await enqueueActivity(world, 'session_activity');
    await enqueueActivity(world, 'session_ack');
    const linear = fakeLinear();
    await run(linear.transport);
    expect(linear.calls[0]?.query).toContain('agentActivityCreate');
    expect((linear.calls[0]?.variables.input as { content: { type: string } }).content.type).toBe(
        'thought'
    );
    expect(linear.calls[1]?.query).toContain('agentSessionUpdate');
});

test('eight failures make a row dead, and dead rows never run again', async () => {
    const world = await seed();
    await enqueueActivity(world, 'session_activity');
    const linear = fakeLinear({ failNext: 100 });
    for (let attempt = 1; attempt <= linearOutboxMaxAttempts; attempt += 1) {
        await run(linear.transport);
        now = new Date(now.getTime() + 60 * 60 * 1000);
    }
    const [dead] = await outboxRows(connection.db, world.workspaceId);
    expect(dead).toMatchObject({ attempts: 8, state: 'dead' });
    expect(dead?.lastError).toContain('503');
    const before = linear.calls.length;
    await run(linear.transport);
    expect(linear.calls.length).toBe(before);
});

test('a granted Agent gets its group and label once; regrant after removal is a fresh label', async () => {
    const world = await seed();
    // The seed's labels are active; start this Agent from nothing.
    await connection.db
        .delete(linearAgentLabelsTable)
        .where(eq(linearAgentLabelsTable.workspaceId, world.workspaceId));
    const grant = {
        agentId: world.agents.juniper,
        connectionId: world.connectionId,
        serverId: world.serverId,
    };
    await connection.db.transaction((tx) => labelLifecycle.agentGrantAdded(tx, grant, now));
    await connection.db.transaction((tx) => labelLifecycle.agentGrantAdded(tx, grant, now));
    const kinds = (await outboxRows(connection.db, world.workspaceId)).map((row) => row.kind);
    expect(kinds).toEqual(['label_group_create', 'label_create']);
    const linear = fakeLinear({ nameTaken: ['Juniper'] });
    await run(linear.transport);
    // The label waited on its group; the group's success released it at once.
    await run(linear.transport);
    const [group] = await connection.db
        .select()
        .from(linearLabelGroupsTable)
        .where(eq(linearLabelGroupsTable.workspaceId, world.workspaceId));
    const [label] = await connection.db
        .select()
        .from(linearAgentLabelsTable)
        .where(eq(linearAgentLabelsTable.workspaceId, world.workspaceId));
    expect(label).toMatchObject({ agentId: world.agents.juniper, state: 'active' });
    const labelCreates = linear.calls.filter((call) => call.query.includes('issueLabelCreate'));
    expect(labelCreates.map((call) => (call.variables.input as { name: string }).name)).toEqual([
        'Agent',
        'Juniper',
        'Juniper (Haus)',
    ]);
    expect((labelCreates[2]?.variables.input as { parentId: string }).parentId).toBe(
        group?.groupLabelId
    );

    await connection.db
        .delete(agentMcpConnectionGrantsTable)
        .where(eq(agentMcpConnectionGrantsTable.agentId, world.agents.juniper));
    await connection.db.transaction((tx) => labelLifecycle.agentGrantRemoved(tx, grant, now));
    const archive = (await outboxRows(connection.db, world.workspaceId)).at(-1);
    expect(archive).toMatchObject({ input: { labelId: label?.labelId }, kind: 'label_archive' });
    await connection.db.insert(agentMcpConnectionGrantsTable).values(grant);
    await connection.db.transaction((tx) => labelLifecycle.agentGrantAdded(tx, grant, now));
    const rows = await connection.db
        .select({ state: linearAgentLabelsTable.state })
        .from(linearAgentLabelsTable)
        .where(eq(linearAgentLabelsTable.workspaceId, world.workspaceId));
    expect(rows.map((row) => row.state).sort()).toEqual(['archived', 'pending']);
});

test('a label whose grant went away while it was being created is archived once it lands', async () => {
    const world = await seed();
    await connection.db
        .delete(linearAgentLabelsTable)
        .where(eq(linearAgentLabelsTable.workspaceId, world.workspaceId));
    const grant = {
        agentId: world.agents.beacon,
        connectionId: world.connectionId,
        serverId: world.serverId,
    };
    await connection.db.transaction((tx) => labelLifecycle.agentGrantAdded(tx, grant, now));
    await connection.db.transaction((tx) => labelLifecycle.agentGrantRemoved(tx, grant, now));
    // Nothing was created yet, so nothing is archived in Linear yet.
    expect((await outboxRows(connection.db, world.workspaceId)).map((row) => row.kind)).toEqual([
        'label_group_create',
        'label_create',
    ]);
    const linear = fakeLinear();
    await run(linear.transport);
    await run(linear.transport);
    await run(linear.transport);
    const rows = await outboxRows(connection.db, world.workspaceId);
    // The group and label share one enqueue time; only the archive comes after.
    const [archive, ...creates] = rows.toReversed();
    const create = rows.find((row) => row.kind === 'label_create');
    expect(archive).toMatchObject({ kind: 'label_archive', state: 'done' });
    expect(creates.map((row) => [row.kind, row.state]).sort()).toEqual([
        ['label_create', 'done'],
        ['label_group_create', 'done'],
    ]);
    expect(archive?.input).toEqual({ labelId: create?.clientId });
});
