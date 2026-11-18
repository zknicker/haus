import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { makeTestRuntime } from '@haus/effect';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import {
    type GithubIngestDependencies,
    ingestGithubDelivery,
} from '../src/github/delivery-ingest.ts';
import { markGithubTriggersProblem } from '../src/github/trigger-problems.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { ServerPostCommitWork } from '../src/server-post-commit-work.ts';
import { TriggerRateLimiter } from '../src/triggers/trigger-rate-limit.ts';
import { workflowRunPayload } from './github-delivery-fixtures.ts';
import {
    type GithubTriggerWorld,
    insertGithubTrigger,
    seedGithubTriggerWorld,
} from './github-trigger-seed.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

// Ingest driven directly: atomic fan-out and rollback, the 25-Trigger cap's
// worth of matches in one delivery, and problems found at match time.

const runtime = makeTestRuntime();
const offline: DeliveryTransport = { isOnline: () => false, send: () => false };
const failureEvents = [{ conclusions: ['failure'], event: 'workflow_run' }];

let connection: HausConnection;
let harness: HausServerHarness;
let world: GithubTriggerWorld;
let now = new Date();

beforeAll(async () => {
    harness = await startHausServerHarness();
    world = await seedGithubTriggerWorld(harness, 'github-ingest');
    connection = await connectHausDatabase(harness.databaseUrl);
});

afterAll(async () => {
    world?.owner.close();
    await connection?.close();
    await harness?.close();
    await runtime.dispose();
});

function dependencies(delivery: Pick<AgentDelivery, 'dispatchAgent' | 'enqueue'>) {
    return {
        clock: { now: () => now },
        db: connection.db,
        delivery: delivery as AgentDelivery,
        limiter: new TriggerRateLimiter(),
        markProblem: markGithubTriggersProblem,
        postCommitWork: new ServerPostCommitWork(runtime),
        reconcile: () => Promise.resolve(),
        runtime,
    } satisfies GithubIngestDependencies;
}

test('a failure mid fan-out rolls back every fire, and a stale claim is retried', async () => {
    const triggers = await Promise.all(
        [1, 2, 3].map(() => insertGithubTrigger(harness, world, { events: failureEvents }))
    );
    const real = new AgentDelivery(connection.db, offline);
    let enqueued = 0;
    const flaky = {
        dispatchAgent: real.dispatchAgent.bind(real),
        enqueue: (...args: Parameters<AgentDelivery['enqueue']>) => {
            enqueued += 1;
            if (enqueued === 2) {
                return Promise.reject(new Error('enqueue failed'));
            }
            return real.enqueue(...args);
        },
    };
    const guid = randomUUID();
    const delivery = {
        event: 'workflow_run',
        guid,
        payload: workflowRunPayload(),
        source: 'webhook',
    } as const;
    await expect(ingestGithubDelivery(dependencies(flaky), delivery)).rejects.toThrow(
        'enqueue failed'
    );
    expect(await firesFor(guid)).toBe(0);
    expect(await deliveryState(guid)).toBe('processing');

    // A fresh claim is someone else's attempt; a stale one is retried.
    expect(await ingestGithubDelivery(dependencies(real), delivery)).toEqual({
        kind: 'in_progress',
    });
    now = new Date(now.getTime() + 6 * 60 * 1000);
    expect(await ingestGithubDelivery(dependencies(real), delivery)).toEqual({
        kind: 'accepted',
        routed: 3,
    });
    expect(await firesFor(guid)).toBe(3);
    expect(
        await ingestGithubDelivery(dependencies(real), { ...delivery, source: 'recovery' })
    ).toEqual({ kind: 'duplicate' });
    await deleteTriggers(triggers);
});

test('twenty-five matching Triggers all fire from one delivery', async () => {
    const triggers = await Promise.all(
        Array.from({ length: 25 }, () =>
            insertGithubTrigger(harness, world, { events: failureEvents })
        )
    );
    const guid = randomUUID();
    const outcome = await ingestGithubDelivery(
        dependencies(new AgentDelivery(connection.db, offline)),
        { event: 'workflow_run', guid, payload: workflowRunPayload(), source: 'recovery' }
    );
    expect(outcome).toEqual({ kind: 'accepted', routed: 25 });
    expect(await firesFor(guid)).toBe(25);
    await deleteTriggers(triggers);
});

test('a grant revoked while a delivery waits for the Server lock stops it firing', async () => {
    const triggerId = await insertGithubTrigger(harness, world, { events: failureEvents });
    const { promise: released, resolve: release } = Promise.withResolvers<void>();
    // A grant mutation holds the Server lock, as `mcp.setGrant` now does.
    const revoking = harness.sql.begin(async (tx) => {
        await tx`select id from servers where id = ${world.serverId} for update`;
        await released;
        await tx`delete from agent_mcp_connection_grants where agent_id = ${world.agentId}`;
    });
    const guid = randomUUID();
    const ingesting = ingestGithubDelivery(
        dependencies(new AgentDelivery(connection.db, offline)),
        { event: 'workflow_run', guid, payload: workflowRunPayload(), source: 'webhook' }
    );
    await waitForLockWaiter();
    release();
    await revoking;
    expect(await ingesting).toEqual({ kind: 'accepted', routed: 0 });
    expect(await firesFor(guid)).toBe(0);
    expect(await problemOf(triggerId)).toBe('agent_access_revoked');

    await harness.sql`
        insert into agent_mcp_connection_grants (server_id, agent_id, connection_id)
        values (${world.serverId}, ${world.agentId}, ${world.connectionId})
    `;
    await deleteTriggers([triggerId]);
});

test('revoking Agent access commits only after the Server lock frees', async () => {
    const { promise: released, resolve: release } = Promise.withResolvers<void>();
    const holding = harness.sql.begin(async (tx) => {
        await tx`select id from servers where id = ${world.serverId} for update`;
        await released;
    });
    const granting = world.owner.trpc.mcp.setGrant.mutate({
        agentId: world.agentId,
        connectionId: world.connectionId,
        enabled: false,
        serverId: world.serverId,
    });
    await waitForLockWaiter();
    const grantsWhileLocked = await harness.sql`
        select agent_id from agent_mcp_connection_grants where agent_id = ${world.agentId}
    `;
    release();
    await holding;
    await granting;
    expect(grantsWhileLocked).toHaveLength(1);
    expect(
        await harness.sql`
            select agent_id from agent_mcp_connection_grants where agent_id = ${world.agentId}
        `
    ).toHaveLength(0);
    await world.owner.trpc.mcp.setGrant.mutate({
        agentId: world.agentId,
        connectionId: world.connectionId,
        enabled: true,
        serverId: world.serverId,
    });
});

test('a lost grant or a stale access cache puts matches into a problem instead of firing', async () => {
    const triggerId = await insertGithubTrigger(harness, world, { events: failureEvents });
    const delivery = new AgentDelivery(connection.db, offline);

    await harness.sql`
        update github_installations set access_synced_at = ${new Date(now.getTime() - 25 * 3_600_000)}
        where id = ${world.installationRowId}
    `;
    const stale = randomUUID();
    expect(
        await ingestGithubDelivery(dependencies(delivery), {
            event: 'workflow_run',
            guid: stale,
            payload: workflowRunPayload(),
            source: 'webhook',
        })
    ).toEqual({ kind: 'accepted', routed: 0 });
    expect(await problemOf(triggerId)).toBe('sign_in_required');
    expect(await firesFor(stale)).toBe(0);
    const notices = await harness.sql`
        select source from agent_inbox
        where source = 'trigger_problem' and dedupe_key like ${`problem:${triggerId}:%`}
    `;
    expect(notices).toHaveLength(1);

    await harness.sql`
        update github_installations set access_synced_at = ${now} where id = ${world.installationRowId}
    `;
    await harness.sql`
        update github_trigger_configs set problem = null, problem_since = null where trigger_id = ${triggerId}
    `;
    await harness.sql`
        delete from agent_mcp_connection_grants where agent_id = ${world.agentId}
    `;
    const revoked = randomUUID();
    await ingestGithubDelivery(dependencies(delivery), {
        event: 'workflow_run',
        guid: revoked,
        payload: workflowRunPayload(),
        source: 'webhook',
    });
    expect(await problemOf(triggerId)).toBe('agent_access_revoked');
    expect(await firesFor(revoked)).toBe(0);
});

async function firesFor(guid: string) {
    const [row] = (await harness.sql`
        select count(*)::int as total from trigger_fires where dedupe_key = ${`gh:${guid}`}
    `) as { total: number }[];
    return row?.total ?? 0;
}

async function deliveryState(guid: string) {
    const [row] = (await harness.sql`
        select state from github_webhook_deliveries where delivery_guid = ${guid}
    `) as { state: string }[];
    return row?.state ?? null;
}

async function problemOf(triggerId: string) {
    const [row] = (await harness.sql`
        select problem from github_trigger_configs where trigger_id = ${triggerId}
    `) as { problem: string | null }[];
    return row?.problem ?? null;
}

/** Resolves once some backend is blocked on a row lock (the held Server row). */
async function waitForLockWaiter() {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        const [row] = (await harness.sql`
            select count(*)::int as waiting from pg_stat_activity
            where wait_event_type = 'Lock' and datname = current_database()
        `) as { waiting: number }[];
        if ((row?.waiting ?? 0) > 0) {
            return;
        }
        await Bun.sleep(10);
    }
    throw new Error('Nothing waited for the Server lock.');
}

async function deleteTriggers(ids: string[]) {
    await harness.sql`
        update triggers set deleted_at = now(), status = 'disabled' where id in ${harness.sql(ids)}
    `;
}
