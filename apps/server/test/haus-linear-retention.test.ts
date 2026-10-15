import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { startLinearRetentionSweep } from '../src/linear/retention.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { linearOutboxTable, linearWebhookDeliveriesTable } from '../src/postgres/schema.ts';
import { seedLinearSessionWorld } from './linear-session-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Linear's operational records expire in the Linear retention sweep; unfinished work never does.

let cluster: PostgresCluster;
let connection: HausConnection;
const now = new Date('2026-10-15T12:00:00.000Z');
const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

test('finished deliveries and settled outbox rows expire after seven days; queued ones stay', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const delivery = (state: 'queued' | 'done' | 'failed') => ({
        body: state === 'done' ? null : { type: 'Issue' },
        deliveryId: crypto.randomUUID(),
        event: 'Issue',
        id: createOpaqueId('lnd'),
        nextAttemptAt: eightDaysAgo,
        processedAt: state === 'queued' ? null : eightDaysAgo,
        receivedAt: eightDaysAgo,
        receiver: 'app',
        serverId: world.serverId,
        state,
        webhookTimestamp: eightDaysAgo,
        workspaceId: world.workspaceId,
    });
    await connection.db
        .insert(linearWebhookDeliveriesTable)
        .values([delivery('queued'), delivery('done'), delivery('failed')]);
    const outbox = (state: 'queued' | 'dead') => ({
        createdAt: eightDaysAgo,
        credentialId: world.credentialId,
        doneAt: state === 'queued' ? null : eightDaysAgo,
        id: createOpaqueId('lnx'),
        input: { labelId: 'label-1' },
        kind: 'label_archive' as const,
        nextAttemptAt: eightDaysAgo,
        serverId: world.serverId,
        state,
        workspaceId: world.workspaceId,
    });
    await connection.db.insert(linearOutboxTable).values([outbox('queued'), outbox('dead')]);

    // The Linear module's own sweep, registered with the Server's sweeps, runs on boot.
    const sweep = startLinearRetentionSweep(
        connection.db,
        { now: () => now },
        { clearInterval: () => undefined, setInterval: () => setTimeout(() => undefined, 0) }
    );
    await sweep.close();

    const deliveries = await connection.db
        .select({ state: linearWebhookDeliveriesTable.state })
        .from(linearWebhookDeliveriesTable)
        .where(eq(linearWebhookDeliveriesTable.workspaceId, world.workspaceId));
    expect(deliveries.map((row) => row.state)).toEqual(['queued']);
    const rows = await connection.db
        .select({ state: linearOutboxTable.state })
        .from(linearOutboxTable)
        .where(eq(linearOutboxTable.workspaceId, world.workspaceId));
    expect(rows.map((row) => row.state)).toEqual(['queued']);
});
