import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentInboxItemSchema, cloudAgentStallAttentionId } from '@haus/api';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { cloudAgentRunsTable, cloudAgentWorkTable } from '../src/postgres/schema.ts';
import { deliverHuman, offlineDelivery, type Seed, seedAgent } from './agent-inbox-harness.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

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

test('a stall attention reaches the Agent as a valid inbox item', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const runId = await seedRun(seed);
    const stallId = cloudAgentStallAttentionId(runId, 249_154);
    await queueAttention(delivery, seed, stallId);

    const frame = await wake();

    const items = (frame?.inbox ?? []).map((item) => agentInboxItemSchema.parse(item));
    expect(items.map((item) => item.id)).toEqual([stallId]);
    expect(items[0]?.cloudAgentWork).toMatchObject({ errorCode: 'claude-prompt-not-found', runId });
});

test('a queued attention whose Run is gone cannot block the message behind it', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    await queueAttention(delivery, seed, cloudAgentStallAttentionId('car_gone', 249_154));
    const messageId = await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });

    const frame = await wake();

    expect(frame?.inbox.map((item) => item.id)).toEqual([messageId]);
});

async function queueAttention(
    delivery: ReturnType<typeof offlineDelivery>['delivery'],
    seed: Seed,
    dedupeKey: string
) {
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.dmChatId,
        content: '',
        dedupeKey,
        serverId: seed.serverId,
        source: 'cloud_agent_work',
    });
}

async function seedRun(seed: Seed): Promise<string> {
    const workId = createOpaqueId('caw');
    const runId = createOpaqueId('car');
    await connection.db.insert(cloudAgentWorkTable).values({
        agentId: seed.agentId,
        chatId: seed.dmChatId,
        computerId: seed.computerId,
        id: workId,
        launchMessageId: createOpaqueId('msg'),
        provider: 'claude',
        repository: 'haus/haus',
        serverId: seed.serverId,
        status: 'running',
        title: 'Fix the flaky delivery test',
    });
    await connection.db.insert(cloudAgentRunsTable).values({
        errorCode: 'claude-prompt-not-found',
        id: runId,
        serverId: seed.serverId,
        status: 'running',
        workId,
    });
    return runId;
}
