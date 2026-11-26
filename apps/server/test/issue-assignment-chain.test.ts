import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { maxAgentChainTurns } from '../src/agent-delivery/chain-budget.ts';
import * as store from '../src/agent-delivery/store.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentDeliveryTable } from '../src/postgres/schema.ts';
import { offlineDelivery, type Seed } from './agent-inbox-harness.ts';
import {
    addPeerAgent,
    assignNewIssue,
    seedTaskBoard,
    type TaskBoard,
} from './issue-delivery-fixture.ts';
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

function assignFromAgent(board: TaskBoard, peerId: string, title: string) {
    return assignNewIssue(connection.db, board, title, {
        actor: { agentId: peerId, kind: 'captain' },
    });
}

async function turnsOf(seed: Seed) {
    return (await store.readDeliveryState(connection.db, seed.agentId))?.agentChainTurns;
}

test('an assignment from another agent spends the chain', async () => {
    const { board, peerId, seed } = await seedChain(3);
    const { delivery, runner, wake } = offlineDelivery(connection.db, seed);
    await assignFromAgent(board, peerId, 'From a peer');

    const start = await wake();
    expect(start?.issueAssignments?.[0]?.byAgent).toBe(true);
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, start?.runId ?? ''));
    expect(await turnsOf(seed)).toBe(4);
    expect(runner.starts()).toHaveLength(1);
});

test('a person assigning an Issue resets the chain', async () => {
    const { board, seed } = await seedChain(3);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    await assignNewIssue(connection.db, board, 'From a person');

    const start = await wake();
    expect(start?.issueAssignments?.[0]?.byAgent).toBe(false);
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, start?.runId ?? ''));
    expect(await turnsOf(seed)).toBe(0);
});

test('at the ceiling an agent assignment waits until a person assigns, then both drain', async () => {
    const { board, peerId, seed } = await seedChain(maxAgentChainTurns);
    const { delivery, runner, wake } = offlineDelivery(connection.db, seed);
    await assignFromAgent(board, peerId, 'Loop');

    expect(await wake()).toBeUndefined();
    expect(runner.starts()).toHaveLength(0);

    await assignNewIssue(connection.db, board, 'From a person');
    await delivery.dispatchAgent(seed.agentId, seed.serverId);
    const [start] = runner.starts();
    expect(start?.issueAssignments?.map((issue) => issue.title)).toEqual([
        'Loop',
        'From a person',
    ]);
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, start?.runId ?? ''));
    expect(await turnsOf(seed)).toBe(0);
});
