import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type {
    LinearDeliveryHandler,
    LinearDeliveryHandlers,
} from '../src/linear/delivery-handler.ts';
import { ingestLinearDelivery, linearWebhookReceivers } from '../src/linear/delivery-ingest.ts';
import {
    linearDeliveryMaxAttempts,
    runLinearDeliveryBatch,
} from '../src/linear/delivery-worker.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    linearIdentitiesTable,
    linearIdentitySecretsTable,
    linearWebhookDeliveriesTable,
    linearWorkspacesTable,
} from '../src/postgres/schema.ts';
import {
    type LinearSessionWorld,
    linearTestRuntime,
    seedLinearIdentity,
    seedLinearSessionWorld,
} from './linear-session-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Durable ingest (specs/linear-app.md#durable-ingest): persist before the
// answer, dedupe per receiver, then the worker's exactly-once routing, retry,
// and poison.

let cluster: PostgresCluster;
let connection: HausConnection;
let world: LinearSessionWorld;
let now = new Date('2026-10-15T12:00:00.000Z');

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

function delivery(organizationId: string, receiver = 'app') {
    return {
        deliveryId: crypto.randomUUID(),
        event: 'Issue',
        payload: {
            action: 'update',
            data: { id: 'issue-1' },
            organizationId,
            type: 'Issue',
            webhookTimestamp: now.getTime(),
        },
        receivedAt: now,
        receiver,
        webhookTimestamp: now,
    };
}

async function row(deliveryId: string) {
    const [found] = await connection.db
        .select()
        .from(linearWebhookDeliveriesTable)
        .where(eq(linearWebhookDeliveriesTable.deliveryId, deliveryId));
    return found;
}

function handlers(apply: LinearDeliveryHandler['apply']): LinearDeliveryHandlers {
    const handler: LinearDeliveryHandler = { apply };
    return { dataChange: handler, lifecycle: handler, session: handler };
}

function worker(apply: LinearDeliveryHandler['apply']) {
    return runLinearDeliveryBatch({
        clock: { now: () => now },
        db: connection.db,
        handlers: handlers(apply),
        onCommitted: () => undefined,
        runtime: linearTestRuntime,
    });
}

test('a delivery is persisted queued with its raw body, once per receiver', async () => {
    const input = delivery(world.organizationId);
    expect(await ingestLinearDelivery(connection.db, input)).toEqual({
        kind: 'accepted',
        queued: true,
        receiverKind: 'app',
    });
    expect(await ingestLinearDelivery(connection.db, input)).toEqual({
        kind: 'duplicate',
        receiverKind: 'app',
    });
    const stored = await row(input.deliveryId);
    expect(stored).toMatchObject({
        body: input.payload,
        serverId: world.serverId,
        state: 'queued',
        workspaceId: world.workspaceId,
    });
    const [workspace] = await connection.db
        .select({ lastDeliveryAt: linearWorkspacesTable.lastDeliveryAt })
        .from(linearWorkspacesTable)
        .where(eq(linearWorkspacesTable.id, world.workspaceId));
    expect(workspace?.lastDeliveryAt).toEqual(now);
    // The same Linear-Delivery on another receiver is another delivery.
    const identity = await seedLinearIdentity(connection.db, world, world.agents.beacon);
    expect(
        await ingestLinearDelivery(connection.db, { ...input, receiver: identity.identityId })
    ).toMatchObject({ kind: 'accepted', receiverKind: 'identity' });
    await worker(() => Promise.resolve({ announce: [], kind: 'done', routed: 0, wakes: [] }));
});

test('an unknown organization is stored ignored with no body and no Server', async () => {
    const input = delivery('org-nobody');
    expect(await ingestLinearDelivery(connection.db, input)).toMatchObject({
        kind: 'accepted',
        queued: false,
    });
    expect(await row(input.deliveryId)).toMatchObject({
        body: null,
        ignoredReason: 'unknown_workspace',
        serverId: null,
        state: 'ignored',
    });
});

test('routing commits with done and clears the raw body', async () => {
    const input = delivery(world.organizationId);
    await ingestLinearDelivery(connection.db, input);
    let calls = 0;
    await worker(() => {
        calls += 1;
        return Promise.resolve({ announce: [], kind: 'done', routed: 2, wakes: [] });
    });
    expect(calls).toBe(1);
    expect(await row(input.deliveryId)).toMatchObject({
        body: null,
        routedCount: 2,
        state: 'done',
    });
    await worker(() => Promise.reject(new Error('never routed twice')));
});

test('a crash after the claim replays exactly once after the lease', async () => {
    const input = delivery(world.organizationId);
    await ingestLinearDelivery(connection.db, input);
    // Claimed, then the process died: the row stays `processing` under its lease.
    await connection.db
        .update(linearWebhookDeliveriesTable)
        .set({ nextAttemptAt: new Date(now.getTime() + 5 * 60_000), state: 'processing' })
        .where(eq(linearWebhookDeliveriesTable.deliveryId, input.deliveryId));
    let calls = 0;
    const count = () => {
        calls += 1;
        return Promise.resolve({ announce: [], kind: 'done' as const, routed: 1, wakes: [] });
    };
    await worker(count);
    expect(calls).toBe(0);
    now = new Date(now.getTime() + 5 * 60_000 + 1);
    await worker(count);
    await worker(count);
    expect(calls).toBe(1);
    expect((await row(input.deliveryId))?.state).toBe('done');
});

test('a failure rolls back, backs off, and the eighth makes it failed with its body kept', async () => {
    const input = delivery(world.organizationId);
    await ingestLinearDelivery(connection.db, input);
    const failing = () => Promise.reject(new Error('Linear read failed'));
    await worker(failing);
    const first = await row(input.deliveryId);
    expect(first).toMatchObject({ attempts: 1, state: 'queued' });
    expect(first?.nextAttemptAt).toEqual(new Date(now.getTime() + 10_000));
    for (let attempt = 2; attempt <= linearDeliveryMaxAttempts; attempt += 1) {
        now = new Date(now.getTime() + 60 * 60 * 1000);
        await worker(failing);
    }
    const poisoned = await row(input.deliveryId);
    expect(poisoned).toMatchObject({ attempts: 8, body: input.payload, state: 'failed' });
    now = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await worker(() => Promise.reject(new Error('never retried automatically')));
    expect((await row(input.deliveryId))?.attempts).toBe(8);
});

test('a deferral rolls back what the step wrote and rechecks two seconds later', async () => {
    const input = delivery(world.organizationId);
    await ingestLinearDelivery(connection.db, input);
    await worker(async (tx) => {
        await tx
            .update(linearWorkspacesTable)
            .set({ name: 'Should roll back' })
            .where(eq(linearWorkspacesTable.id, world.workspaceId));
        return { kind: 'defer' };
    });
    const deferred = await row(input.deliveryId);
    expect(deferred).toMatchObject({ deferredSince: now, state: 'queued' });
    expect(deferred?.nextAttemptAt).toEqual(new Date(now.getTime() + 2000));
    const [workspace] = await connection.db
        .select({ name: linearWorkspacesTable.name })
        .from(linearWorkspacesTable)
        .where(eq(linearWorkspacesTable.id, world.workspaceId));
    expect(workspace?.name).toBe('Haus');
    now = new Date(now.getTime() + 2000);
    await worker(() => Promise.resolve({ announce: [], kind: 'done', routed: 0, wakes: [] }));
    expect((await row(input.deliveryId))?.state).toBe('done');
});

test('identity receivers accept the previous secret only inside its window', async () => {
    const identity = await seedLinearIdentity(connection.db, world, world.agents.juniper);
    await connection.db
        .update(linearIdentitySecretsTable)
        .set({ previousExpiresAt: new Date(now.getTime() + 1000), previousWebhookSecret: 'old' })
        .where(eq(linearIdentitySecretsTable.identityId, identity.identityId));
    let clock = now;
    const receivers = linearWebhookReceivers(connection.db, {
        appSecret: null,
        appSecretPrevious: null,
        clock: { now: () => clock },
    });
    expect(receivers.appSecrets()).toBeNull();
    expect((await receivers.identity(identity.identityId))?.secrets).toEqual([
        identity.secret,
        'old',
    ]);
    clock = new Date(now.getTime() + 1001);
    expect((await receivers.identity(identity.identityId))?.secrets).toEqual([identity.secret]);
    await connection.db
        .update(linearIdentitiesTable)
        .set({ removedAt: now, status: 'removed' })
        .where(eq(linearIdentitiesTable.id, identity.identityId));
    expect(await receivers.identity(identity.identityId)).toBeNull();
});
