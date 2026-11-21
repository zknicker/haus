import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentTurnSummary } from '@haus/api';
import { eq } from 'drizzle-orm';
import { enqueueAgentGreeting } from '../src/agent-delivery/greeting.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentsTable } from '../src/postgres/schema.ts';
import { queryAgents } from '../src/server-agents/query-agents.ts';
import { testAgentHome } from './agent-home.ts';
import { offlineDelivery, type Seed, seedAgent } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';

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

test('a new Agent is applied once its first run dispatches, with no Computer report', async () => {
    const seed = await seedAgent(connection.db);
    expect(await readAgent(seed)).toMatchObject({ effectiveReportedAt: null, status: 'pending' });
    await enqueueAgentGreeting(connection.db, {
        agentId: seed.agentId,
        allChannelId: await testAgentHome(connection.db, seed.serverId),
        serverId: seed.serverId,
    });
    const { wake } = offlineDelivery(connection.db, seed);

    const start = await wake();

    expect(start?.greets).toBe(true);
    expect(await readAgent(seed)).toMatchObject({
        effectiveModelId: 'fake-model',
        effectiveRuntimeId: 'fake',
        missingResources: [],
        status: 'applied',
    });
});

test('a reconfigure during a run stays pending until the next run dispatches on it', async () => {
    const seed = await seedAgent(connection.db);
    const allChannelId = await testAgentHome(connection.db, seed.serverId);
    await enqueueAgentGreeting(connection.db, {
        agentId: seed.agentId,
        allChannelId,
        serverId: seed.serverId,
    });
    const { delivery, runner, wake } = offlineDelivery(connection.db, seed);
    const first = await wake();
    await delivery.onAck({ agentId: seed.agentId, runId: first?.runId ?? '' });

    await connection.db
        .update(agentsTable)
        .set({ desiredModelId: 'fake-model-next' })
        .where(eq(agentsTable.id, seed.agentId));
    expect(await readAgent(seed)).toMatchObject({
        effectiveModelId: 'fake-model',
        status: 'pending',
    });

    await connection.db.transaction(async (tx) => {
        await delivery.enqueue(tx, {
            agentId: seed.agentId,
            chatId: null,
            content: '',
            dedupeKey: `subagent:${seed.agentId}:wake_1`,
            serverId: seed.serverId,
            source: 'subagent',
        });
    });
    await delivery.onTurnSettled(seed.computerId, summary(seed, first?.runId ?? ''));

    expect(runner.starts().at(-1)?.runId).not.toBe(first?.runId);
    expect(await readAgent(seed)).toMatchObject({
        effectiveModelId: 'fake-model-next',
        status: 'applied',
    });
});

async function readAgent(seed: Seed) {
    const [agent] = await queryAgents(
        connection.db,
        { id: seed.userId },
        seed.serverId,
        seed.agentId
    );
    return agent;
}

function summary(seed: Seed, runId: string) {
    const turn: AgentTurnSummary = {
        activity: { operations: [] },
        agentId: seed.agentId,
        endedAt: new Date().toISOString(),
        messageCount: 1,
        modelId: 'fake-model',
        outputProduced: true,
        runId,
        runtimeId: 'fake',
        startedAt: new Date().toISOString(),
        status: 'completed',
        summary: 'ok',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
    return turn;
}
