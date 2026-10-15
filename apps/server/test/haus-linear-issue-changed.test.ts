import { afterAll, beforeAll, expect, test } from 'bun:test';
import { linearIssueChanged } from '../src/linear/issue-changed.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { deliveryRow, seedLinearSessionWorld } from './linear-session-seed.ts';
import { issueDelivery } from './linear-trigger-deliveries.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// The issue-chip hook: an `Issue` delivery prepares `linear.onIssueChanged`
// for its connection; other deliveries prepare nothing.

let cluster: PostgresCluster;
let connection: HausConnection;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

test('an Issue delivery announces the changed issue on its connection', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const row = deliveryRow(world, { body: issueDelivery(world, {}), event: 'Issue' });
    const prepared = await linearIssueChanged(connection.db, row);
    expect(prepared?.delivery.event).toEqual({
        connectionId: world.connectionId,
        identifier: 'DES-142',
        issueId: 'issue-142',
        serverId: world.serverId,
    });
    const comment = deliveryRow(world, { body: issueDelivery(world, {}), event: 'Comment' });
    expect(await linearIssueChanged(connection.db, comment)).toBeNull();
});
