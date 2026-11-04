import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { maxAgentChainTurns } from '../src/agent-delivery/chain-budget.ts';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import * as store from '../src/agent-delivery/store.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentDeliveryTable } from '../src/postgres/schema.ts';
import { createTask } from '../src/tasks/task-create.ts';
import { settledTurn } from './agent-dream-fixture.ts';
import { offlineDelivery, type Seed } from './agent-inbox-harness.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';
import {
    addPeerAgent,
    assignNewTask,
    seedTaskBoard,
    type TaskBoard,
} from './task-delivery-fixture.ts';

/**
 * Task assignments and the automation chain (specs/github-triggers.md): one an
 * Agent made is Agent-authored traffic, so two Agents assigning each other stop at
 * the ceiling; one a person made starts fresh.
 */
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

async function seedChain(turns: number) {
    const board = await seedTaskBoard(connection.db);
    const { seed } = board;
    await store.ensureDeliveryState(connection.db, seed);
    await connection.db
        .update(agentDeliveryTable)
        .set({ agentChainAdvancedAt: new Date(), agentChainTurns: turns })
        .where(eq(agentDeliveryTable.agentId, seed.agentId));
    const peerId = await addPeerAgent(connection.db, seed);
    return { board, peerId, seed };
}

function assignFromAgent(
    delivery: AgentDelivery,
    { boardId, seed }: TaskBoard,
    peerId: string,
    title: string
) {
    return createTask(connection.db, { agentId: peerId, kind: 'agent' }, delivery, {
        assignee: { agentId: seed.agentId, kind: 'agent' },
        boardId,
        serverId: seed.serverId,
        title,
    });
}

async function turnsOf(seed: Seed) {
    return (await store.readDeliveryState(connection.db, seed.agentId))?.agentChainTurns;
}

test('an assignment from another Agent spends the chain', async () => {
    const { board, peerId, seed } = await seedChain(3);
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    await assignFromAgent(delivery, board, peerId, 'From a peer');

    const start = await wake();
    expect(start?.taskAssignments?.[0]?.assignedByAgent).toBe(true);
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, start?.runId ?? ''));
    expect(await turnsOf(seed)).toBe(4);
    expect(transport.framesOfType('start')).toHaveLength(1);
});

test('a person assigning a Task resets the chain', async () => {
    const { board, seed } = await seedChain(3);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    await assignNewTask(connection.db, delivery, board, 'From a person');

    const start = await wake();
    expect(start?.taskAssignments?.[0]?.assignedByAgent).toBe(false);
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, start?.runId ?? ''));
    expect(await turnsOf(seed)).toBe(0);
});

test('at the ceiling an Agent assignment holds until a person assigns, then both drain', async () => {
    const { board, peerId, seed } = await seedChain(maxAgentChainTurns);
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    await assignFromAgent(delivery, board, peerId, 'Loop');

    expect(await wake()).toBeUndefined();
    await delivery.dispatchAgent(seed.agentId, seed.serverId);
    expect(transport.framesOfType('start')).toHaveLength(0);

    await assignNewTask(connection.db, delivery, board, 'From a person');
    await delivery.dispatchAgent(seed.agentId, seed.serverId);
    const [start] = transport.framesOfType('start');
    expect(start?.taskAssignments?.map((task) => task.title)).toEqual(['Loop', 'From a person']);
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, start?.runId ?? ''));
    expect(await turnsOf(seed)).toBe(0);
});
