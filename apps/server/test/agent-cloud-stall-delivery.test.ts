import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentInboxItemSchema } from '@haus/api';
import { eq } from 'drizzle-orm';
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

test('a stall notice reaches the Agent as a valid inbox item', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const runId = await seedRun(seed);
    const key = `${runId}:stall:1793941134000:0`;
    await queueNotice(delivery, seed, runId, key);

    const frame = await wake();

    const items = (frame?.inbox ?? []).map((item) => agentInboxItemSchema.parse(item));
    expect(items.map((item) => item.id)).toEqual([key]);
    expect(items[0]?.cloudAgentWork).toMatchObject({
        notice: 'stall',
        runId,
        stallCode: 'claude-prompt-not-found',
    });
});

test('a deleted Run takes its queued notice with it, so the message behind it is delivered', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const runId = await seedRun(seed);
    await queueNotice(delivery, seed, runId, runId);
    const messageId = await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    await connection.db.delete(cloudAgentRunsTable).where(eq(cloudAgentRunsTable.id, runId));

    const frame = await wake();

    expect(frame?.inbox.map((item) => item.id)).toEqual([messageId]);
});

async function queueNotice(
    delivery: ReturnType<typeof offlineDelivery>['delivery'],
    seed: Seed,
    runId: string,
    dedupeKey: string
) {
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.dmChatId,
        cloudAgentNotice: dedupeKey === runId ? 'settled' : 'stall',
        cloudAgentRunId: runId,
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
        stallCode: 'claude-prompt-not-found',
        stallSince: new Date(),
        id: runId,
        serverId: seed.serverId,
        status: 'running',
        workId,
    });
    return runId;
}
