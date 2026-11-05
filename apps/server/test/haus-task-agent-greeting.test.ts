import { afterAll, beforeAll, expect, test } from 'bun:test';
import { enqueueAgentGreeting } from '../src/agent-delivery/greeting.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { addChannel, offlineDelivery } from './agent-inbox-harness.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';
import { assignNewTask, seedTaskBoard } from './task-delivery-fixture.ts';

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

/** A chatless run cannot carry the greeting, so an assignment waits for it (greeting.ts). */
test('a Task assignment never runs the main session ahead of the greeting', async () => {
    const board = await seedTaskBoard(connection.db);
    const { seed } = board;
    const allChannelId = await addChannel(connection.db, seed, 'all');
    await enqueueAgentGreeting(connection.db, {
        agentId: seed.agentId,
        allChannelId,
        serverId: seed.serverId,
    });
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    await assignNewTask(connection.db, delivery, board, 'Audit the keys');

    const first = await wake();
    expect(first).toMatchObject({ chatId: allChannelId, greets: true });
    expect(first).not.toHaveProperty('taskAssignments');

    await delivery.onAck({ agentId: seed.agentId, runId: first?.runId ?? '' });
    await delivery.onTurnSettled(seed.computerId, {
        activity: { operations: [] },
        agentId: seed.agentId,
        endedAt: new Date().toISOString(),
        messageCount: 1,
        modelId: 'fake-model',
        outputProduced: true,
        runId: first?.runId ?? '',
        runtimeId: 'fake',
        startedAt: new Date().toISOString(),
        status: 'completed',
        summary: 'ok',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    });

    const assignment = transport.framesOfType('start').at(-1);
    expect(assignment).toMatchObject({ chatId: null });
    expect(assignment?.taskAssignments?.map((item) => item.title)).toEqual(['Audit the keys']);
    expect(assignment?.greets).toBeUndefined();
});
