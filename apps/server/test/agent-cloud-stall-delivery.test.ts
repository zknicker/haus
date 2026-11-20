import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentInboxItemSchema } from '@haus/api';
import { eq } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { workerTurnsTable, workersTable } from '../src/postgres/schema.ts';
import { deliverHuman, offlineDelivery, type Seed, seedAgent } from './agent-inbox-harness.ts';
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

test('a stall notice reaches the Agent as a valid inbox item', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const turnId = await seedRun(seed);
    const key = `${turnId}:stall:1793941134000:0`;
    await queueNotice(delivery, seed, turnId, key);

    const frame = await wake();

    const items = (frame?.inbox ?? []).map((item) => agentInboxItemSchema.parse(item));
    expect(items.map((item) => item.id)).toEqual([key]);
    expect(items[0]?.worker).toMatchObject({
        notice: 'stall',
        turnId,
        stallCode: 'claude-prompt-not-found',
    });
});

test('a deleted Run takes its queued notice with it, so the message behind it is delivered', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const turnId = await seedRun(seed);
    await queueNotice(delivery, seed, turnId, turnId);
    const messageId = await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    await connection.db.delete(workerTurnsTable).where(eq(workerTurnsTable.id, turnId));

    const frame = await wake();

    expect(frame?.inbox.map((item) => item.id)).toEqual([messageId]);
});

async function queueNotice(
    delivery: ReturnType<typeof offlineDelivery>['delivery'],
    seed: Seed,
    turnId: string,
    dedupeKey: string
) {
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.dmChatId,
        workerTurnId: turnId,
        content: '',
        dedupeKey,
        serverId: seed.serverId,
        source: dedupeKey === turnId ? 'worker_report' : 'worker_stall',
    });
}

async function seedRun(seed: Seed): Promise<string> {
    const workerId = createOpaqueId('caw');
    const turnId = createOpaqueId('car');
    await connection.db.insert(workersTable).values({
        agentId: seed.agentId,
        carrierComputerId: seed.computerId,
        closedAt: new Date(),
        id: workerId,
        launchMessageId: createOpaqueId('msg'),
        originChatId: seed.dmChatId,
        place: 'claude',
        repository: 'haus/haus',
        serverId: seed.serverId,
        status: 'running',
        title: 'Fix the flaky delivery test',
    });
    await connection.db.insert(workerTurnsTable).values({
        stallCode: 'claude-prompt-not-found',
        stallSince: new Date(),
        id: turnId,
        serverId: seed.serverId,
        status: 'running',
        workerId,
    });
    return turnId;
}
