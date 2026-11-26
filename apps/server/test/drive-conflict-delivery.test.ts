import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentCommandSchema } from '@haus/api';
import { eq } from 'drizzle-orm';
import { queueDriveConflict } from '../src/drive/conflict-item.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentRunTriggersTable } from '../src/postgres/schema.ts';
import { deliverHuman, offlineDelivery, seedAgent } from './agent-inbox-harness.ts';
import { conflictOf, driveConflictFixture } from './drive-conflict.fixture.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { settledTurn } from './settled-turn-fixture.ts';

let cluster: TestDatabase;
let connection: HausConnection;

beforeAll(async () => {
    cluster = await startMigratedDatabase();
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});
const fixture = () => driveConflictFixture(connection.db);
const queue: ReturnType<typeof fixture>['queue'] = (...args) => fixture().queue(...args);
const conflictRows = (agentId: string) => fixture().conflictRows(agentId);

test('one push queues one item that wakes an idle Agent as its own chatless run', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, runner, wake } = offlineDelivery(connection.db, seed);
    const attention = conflictOf('run_push_idle', { agentId: seed.agentId, type: 'agent' });

    expect(await queue(delivery, seed, attention)).toEqual({
        agentId: seed.agentId,
        serverId: seed.serverId,
    });
    await queue(delivery, seed, attention);
    expect(await conflictRows(seed.agentId)).toEqual([
        {
            chatId: null,
            dedupeKey: 'drive-conflict:run_push_idle',
            mentioned: true,
            runId: null,
            state: 'queued',
        },
    ]);

    const start = await wake();
    expect(start).toMatchObject({
        agentId: seed.agentId,
        chatId: null,
        drainItemIds: [],
        inbox: [],
        inboxDelivery: 'concrete',
        totalPending: 0,
        type: 'start',
        unreadElsewhere: [],
        warmDrainItemIds: [],
    });
    expect(start?.driveConflict).toEqual(attention);
    expect(start).not.toHaveProperty('issueAssignments');
    expect(start).not.toHaveProperty('subagentWake');
    expect(agentCommandSchema.safeParse(start).success).toBe(true);

    await delivery.dispatchAgent(seed.agentId, seed.serverId, { resendActive: true });
    expect(runner.starts().at(-1)).toEqual(start as never);

    const runId = start?.runId ?? '';
    const [trigger] = await connection.db
        .select({
            chatId: agentRunTriggersTable.chatId,
            source: agentRunTriggersTable.source,
            workId: agentRunTriggersTable.workId,
        })
        .from(agentRunTriggersTable)
        .where(eq(agentRunTriggersTable.runId, runId));
    expect(trigger).toEqual({
        chatId: null,
        source: 'drive_conflict',
        workId: 'drive-conflict:run_push_idle',
    });

    await delivery.onAck({ agentId: seed.agentId, runId });
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, runId));
    expect((await conflictRows(seed.agentId)).map((row) => row.state)).toEqual(['seen']);

    await queue(delivery, seed, attention);
    expect(await conflictRows(seed.agentId)).toHaveLength(1);
    expect(runner.starts()).toHaveLength(2);
});

test('two pushes never coalesce: each runs alone', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, runner, wake } = offlineDelivery(connection.db, seed);
    const writer = { agentId: seed.agentId, type: 'agent' as const };
    await queue(delivery, seed, conflictOf('run_push_first', writer));
    await queue(delivery, seed, conflictOf('run_push_second', writer));

    const first = await wake();
    expect(first?.driveConflict?.pushId).toBe('run_push_first');
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, first?.runId ?? ''));
    const second = runner.starts().at(-1);
    expect(second?.driveConflict?.pushId).toBe('run_push_second');
    expect(second?.runId).not.toBe(first?.runId);
});

test("a Worker's push reaches its Agent, and no one else", async () => {
    const seed = await seedAgent(connection.db);
    const other = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const attention = conflictOf('run_push_worker', {
        agentId: seed.agentId,
        taskId: 'tsk_worker_push',
        type: 'worker',
        workerId: 'wkr_one',
    });

    await expect(
        queueDriveConflict(connection.db, delivery, {
            attention,
            recipientAgentId: other.agentId,
            serverId: other.serverId,
        })
    ).rejects.toThrow("Drive conflict drive-conflict:run_push_worker belongs to the writer's");
    expect(await conflictRows(other.agentId)).toEqual([]);

    await queue(delivery, seed, attention);
    const start = await wake();
    expect(start?.driveConflict?.writer).toEqual({
        agentId: seed.agentId,
        taskId: 'tsk_worker_push',
        type: 'worker',
        workerId: 'wkr_one',
    });
});

test('a busy Agent gets no notice, then the item as its next run', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, runner, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    runner.attach(seed.agentId);
    const dmId = await deliverHuman(connection.db, delivery, seed, { chatId: seed.captainChatId });
    const busyRunId = runner.starts()[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId: busyRunId });

    await queue(
        delivery,
        seed,
        conflictOf('run_push_busy', { agentId: seed.agentId, type: 'agent' })
    );
    await delivery.dispatchAgent(seed.agentId, seed.serverId);
    expect(runner.framesOfType('notice')).toEqual([]);

    const humanId = await deliverHuman(connection.db, delivery, seed, { chatId: seed.channelId });
    const notice = runner.framesOfType('notice').at(-1);
    expect(notice?.inbox.map((item) => item.id)).toEqual([dmId, humanId]);
    expect(notice?.totalPending).toBe(2);
    expect(JSON.stringify(notice)).not.toContain('run_push_busy');

    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, busyRunId));
    const next = runner.starts().at(-1);
    expect(next?.runId).not.toBe(busyRunId);
    expect(next?.driveConflict?.pushId).toBe('run_push_busy');
    expect(next?.chatId).toBeNull();
});

test('a failed run with no output requeues the item', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    await queue(
        delivery,
        seed,
        conflictOf('run_push_failed', { agentId: seed.agentId, type: 'agent' })
    );
    const start = await wake();
    const runId = start?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    expect((await conflictRows(seed.agentId)).map((row) => row.state)).toEqual(['served']);

    await delivery.onTurnSettled(seed.computerId, {
        ...settledTurn(seed, runId),
        failureKind: 'transport',
        status: 'failed',
    });
    expect(await conflictRows(seed.agentId)).toEqual([
        {
            chatId: null,
            dedupeKey: 'drive-conflict:run_push_failed',
            mentioned: true,
            runId: null,
            state: 'queued',
        },
    ]);
});
