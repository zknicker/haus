import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { enqueueInboxItem } from '../src/agent-delivery/store.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentInboxTable } from '../src/postgres/schema.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';
import { assignNewTask, seedTaskBoard, taskInboxRows } from './task-delivery-fixture.ts';

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

/**
 * A chatless Task assignment renders in its own run frame, not as an inbox
 * envelope, so a failed dispatch judges it by that frame: only the assignment
 * that cannot decode is set aside, and the rest still coalesce into one run.
 */
test('one malformed Task assignment is set aside and the rest still drain together', async () => {
    const board = await seedTaskBoard(connection.db);
    const { seed } = board;
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    await assignNewTask(connection.db, delivery, board, 'Rotate the keys');
    await assignNewTask(connection.db, delivery, board, 'Patch the host');
    await enqueueInboxItem(connection.db, {
        agentId: seed.agentId,
        chatId: null,
        content: '{"not":"an assignment"}',
        dedupeKey: 'task-assign:tsk_broken:1',
        serverId: seed.serverId,
        source: 'task_assignment',
    });

    const start = await wake();

    expect(transport.framesOfType('start')).toHaveLength(1);
    expect(start).toMatchObject({ chatId: null, inbox: [] });
    expect(start?.taskAssignments?.map((assignment) => assignment.title)).toEqual([
        'Rotate the keys',
        'Patch the host',
    ]);
    const [broken] = await connection.db
        .select({
            state: agentInboxTable.state,
            undeliveredReason: agentInboxTable.undeliveredReason,
        })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.agentId, seed.agentId),
                eq(agentInboxTable.dedupeKey, 'task-assign:tsk_broken:1')
            )
        );
    expect(broken?.state).toBe('seen');
    expect(broken?.undeliveredReason).toBeTruthy();
    // The two good assignments ride the run; neither was set aside with the bad one.
    const good = (await taskInboxRows(connection.db, seed)).filter(
        (row) => row.dedupeKey !== 'task-assign:tsk_broken:1'
    );
    expect(good.map((row) => row.state)).toEqual(['accepted', 'accepted']);
});
