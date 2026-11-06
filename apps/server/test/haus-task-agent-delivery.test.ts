import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentCommandSchema, agentTurnTriggerSchema } from '@haus/api';
import { eq } from 'drizzle-orm';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentRunTriggersTable } from '../src/postgres/schema.ts';
import { resolveAgentTurnTriggers } from '../src/server-agents/agent-turn-trigger-previews.ts';
import { settledTurn } from './agent-dream-fixture.ts';
import { deliverHuman, offlineDelivery, type Seed } from './agent-inbox-harness.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';
import {
    assignNewTask,
    seedTaskBoard,
    type TaskBoard,
    taskInboxRows,
} from './task-delivery-fixture.ts';

/** `task_assignment` delivery (ADR 0051 decision 5, specs/inbox.md). */
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

const seedBoard = () => seedTaskBoard(connection.db);
const inboxRows = (seed: Seed) => taskInboxRows(connection.db, seed);
const assignNew = (delivery: AgentDelivery, board: TaskBoard, title: string) =>
    assignNewTask(connection.db, delivery, board, title);

test('ten assignments to an idle Agent wake it once, with one typed attention', async () => {
    const board = await seedBoard();
    const { seed } = board;
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);

    const results: Awaited<ReturnType<typeof assignNew>>[] = [];
    for (let index = 1; index <= 10; index += 1) {
        results.push(await assignNew(delivery, board, `Task ${index}`));
    }
    expect(results[0]?.wakes).toEqual([{ agentId: seed.agentId, serverId: seed.serverId }]);
    expect(await inboxRows(seed)).toHaveLength(10);
    expect((await inboxRows(seed))[0]).toMatchObject({ mentioned: true, state: 'queued' });

    const start = await wake();
    expect(transport.framesOfType('start')).toHaveLength(1);
    expect(start).toMatchObject({
        chatId: null,
        drainItemIds: [],
        inbox: [],
        inboxDelivery: 'concrete',
    });
    expect(start).not.toHaveProperty('heartbeat');
    expect(start?.taskAssignments).toHaveLength(10);
    expect(start?.taskAssignments?.[0]).toEqual({
        assignedBy: seed.humanHandle,
        assignedByAgent: false,
        board: 'General',
        column: 'Todo',
        id: `task-assign:${results[0]?.task.id}:1`,
        key: 'GEN-1',
        priority: 'high',
        taskId: results[0]?.task.id ?? '',
        title: 'Task 1',
    });
    expect(agentCommandSchema.safeParse(start).success).toBe(true);

    // A resend reproduces the same chatless frame.
    await delivery.dispatchAgent(seed.agentId, seed.serverId, { resendActive: true });
    expect(transport.framesOfType('start').at(-1)).toEqual(start as never);

    const runId = start?.runId ?? '';
    const [trigger] = await connection.db
        .select()
        .from(agentRunTriggersTable)
        .where(eq(agentRunTriggersTable.runId, runId));
    expect(trigger).toMatchObject({
        chatId: null,
        source: 'task_assignment',
        workId: `task-assign:${results[0]?.task.id}:1`,
    });
    const [named] = await resolveAgentTurnTriggers(
        connection.db,
        { serverId: seed.serverId, userId: seed.userId },
        [
            {
                chatId: null,
                runId,
                source: 'task_assignment',
                visible: false,
                workId: trigger?.workId ?? '',
            },
        ]
    );
    expect(agentTurnTriggerSchema.parse(named)).toEqual({
        key: 'GEN-1',
        kind: 'task',
        more: 9,
        taskId: results[0]?.task.id ?? '',
        title: 'Task 1',
    });

    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, runId));
    expect((await inboxRows(seed)).every((row) => row.state === 'seen')).toBe(true);
    // The first dispatch and its resend: all ten rode the one run.
    expect(new Set(transport.framesOfType('start').map((frame) => frame.runId))).toEqual(
        new Set([runId])
    );
});

test('a busy Agent gets a content-free count, then the concrete Tasks on its next turn', async () => {
    const board = await seedBoard();
    const { seed } = board;
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: null,
        content: 'The Q4 thread is stuck.',
        dedupeKey: 'heartbeat-report:run_task_busy',
        serverId: seed.serverId,
        source: 'heartbeat_report',
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });

    const first = await assignNew(delivery, board, 'Rotate the keys');
    const second = await assignNew(delivery, board, 'Patch the host');
    await delivery.dispatchAgent(seed.agentId, seed.serverId);

    const notice = transport.framesOfType('notice').at(-1);
    expect(notice).toMatchObject({
        inbox: [],
        runId,
        taskAssignments: {
            ids: [`task-assign:${first.task.id}:1`, `task-assign:${second.task.id}:1`],
            total: 2,
        },
        totalPending: 0,
    });
    expect(JSON.stringify(notice)).not.toContain('Rotate the keys');
    expect(agentCommandSchema.safeParse(notice).success).toBe(true);

    await delivery.onNoticeAck({
        agentId: seed.agentId,
        runId,
        workIds: notice?.taskAssignments?.ids ?? [],
    });
    const noticed = transport.framesOfType('notice').length;
    await delivery.dispatchAgent(seed.agentId, seed.serverId);
    expect(transport.framesOfType('notice')).toHaveLength(noticed);

    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, runId));
    const next = transport.framesOfType('start').at(-1);
    expect(next?.runId).not.toBe(runId);
    expect(next?.taskAssignments?.map((task) => task.title)).toEqual([
        'Rotate the keys',
        'Patch the host',
    ]);
});

test('a busy notice beside Chat work keeps both, counted apart', async () => {
    const board = await seedBoard();
    const { seed } = board;
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });

    await assignNew(delivery, board, 'Rotate the keys');
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.channelId });

    const notice = transport.framesOfType('notice').at(-1);
    expect(notice?.inbox).toHaveLength(2);
    expect(notice).toMatchObject({ taskAssignments: { total: 1 }, totalPending: 2 });
});

test('other chatless work still runs alone, apart from the Task batch', async () => {
    const board = await seedBoard();
    const { seed } = board;
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    await delivery.enqueue(connection.db, {
        agentId: seed.agentId,
        chatId: null,
        content: 'The Q4 thread is stuck.',
        dedupeKey: 'heartbeat-report:run_task_batch',
        serverId: seed.serverId,
        source: 'heartbeat_report',
    });
    await assignNew(delivery, board, 'One');
    await assignNew(delivery, board, 'Two');

    const report = await wake();
    expect(report).toMatchObject({ heartbeatReport: { text: 'The Q4 thread is stuck.' } });
    expect(report).not.toHaveProperty('taskAssignments');

    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, report?.runId ?? ''));
    const tasks = transport.framesOfType('start').at(-1);
    expect(tasks?.taskAssignments).toHaveLength(2);
    expect(tasks).not.toHaveProperty('heartbeatReport');
});
