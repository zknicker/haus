import { afterAll, beforeAll, expect, test } from 'bun:test';
import { maxAgentChainTurns } from '../src/agent-delivery/chain-budget.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { deliverHuman, offlineDelivery, type Seed, seedAgent } from './agent-inbox-harness.ts';
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
const setChain = (seed: Seed, turns: number) => fixture().setChain(seed, turns);
const turnsOf = (seed: Seed) => fixture().turnsOf(seed);

test('the item spends the automation chain', async () => {
    const seed = await seedAgent(connection.db);
    await setChain(seed, 3);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    await queue(
        delivery,
        seed,
        conflictOf('run_push_chain', { agentId: seed.agentId, type: 'agent' })
    );
    const start = await wake();
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, start?.runId ?? ''));
    expect(await turnsOf(seed)).toBe(4);
});

test('at the ceiling the item waits queued until a person speaks, then runs first', async () => {
    const seed = await seedAgent(connection.db);
    await setChain(seed, maxAgentChainTurns);
    const { delivery, runner, wake } = offlineDelivery(connection.db, seed);
    await queue(
        delivery,
        seed,
        conflictOf('run_push_ceiling', { agentId: seed.agentId, type: 'agent' })
    );

    expect(await wake()).toBeUndefined();
    await delivery.dispatchAgent(seed.agentId, seed.serverId);
    expect(runner.starts()).toEqual([]);
    expect((await conflictRows(seed.agentId)).map((row) => row.state)).toEqual(['queued']);

    await deliverHuman(connection.db, delivery, seed, { chatId: seed.captainChatId });
    const [conflictRun] = runner.starts();
    expect(conflictRun?.driveConflict?.pushId).toBe('run_push_ceiling');
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, conflictRun?.runId ?? ''));
    expect(await turnsOf(seed)).toBe(1);

    const humanRun = runner.starts().at(-1);
    expect(humanRun?.chatId).toBe(seed.captainChatId);
    await delivery.onTurnSettled(seed.computerId, {
        ...settledTurn(seed, humanRun?.runId ?? ''),
        outputProduced: true,
    });
    expect(await turnsOf(seed)).toBe(0);
});
