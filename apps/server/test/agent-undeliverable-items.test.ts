import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentCommand } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { clearStartRejectedHolds } from '../src/agent-delivery/failure-hold.ts';
import { settleTurn } from '../src/agent-delivery/settle-turn.ts';
import { enqueueInboxItem } from '../src/agent-delivery/store.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentDeliveryTable, agentInboxTable } from '../src/postgres/schema.ts';
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

/** A human row in a channel with no message behind it cannot name a sender, so it cannot render. */
async function queueUnrenderable(seed: Seed, dedupeKey: string) {
    await enqueueInboxItem(connection.db, {
        agentId: seed.agentId,
        chatId: seed.channelId,
        content: 'private body',
        dedupeKey,
        serverId: seed.serverId,
        source: 'human',
    });
}

/** The note leads its own turn as a concrete item; the queue drains in the next one. */
async function finishTurn(
    delivery: ReturnType<typeof offlineDelivery>['delivery'],
    seed: Seed,
    frame: Extract<AgentCommand, { type: 'start' }> | undefined
) {
    await delivery.onAck({ agentId: seed.agentId, runId: frame?.runId ?? 'run' });
    await delivery.onTurnSettled(seed.computerId, {
        activity: { operations: [] },
        agentId: seed.agentId,
        endedAt: new Date().toISOString(),
        messageCount: 0,
        modelId: frame?.modelId ?? 'model',
        outputProduced: false,
        runId: frame?.runId ?? 'run',
        runtimeId: frame?.runtimeId ?? 'runtime',
        startedAt: new Date().toISOString(),
        status: 'completed',
        summary: 'Done.',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    });
}

async function readRow(seed: Seed, dedupeKey: string) {
    const [row] = await connection.db
        .select()
        .from(agentInboxTable)
        .where(
            and(eq(agentInboxTable.agentId, seed.agentId), eq(agentInboxTable.dedupeKey, dedupeKey))
        );
    return row;
}

test('a bad item beside a human message delivers the message and tells the Agent once', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    await queueUnrenderable(seed, 'msg_broken');
    const messageId = await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });

    const noteFrame = await wake();
    await finishTurn(delivery, seed, noteFrame);

    const ids =
        transport
            .framesOfType('start')
            .at(-1)
            ?.inbox.map((item) => item.id) ?? [];
    expect(ids).toContain(messageId);
    expect(ids).not.toContain('msg_broken');
    const broken = await readRow(seed, 'msg_broken');
    expect(broken?.state).toBe('seen');
    expect(broken?.undeliveredReason).toContain('Error');
    const note = await readRow(seed, `undelivered:${broken?.id}`);
    expect(note?.source).toBe('delivery_problem');
    expect(note?.content).toContain('msg_broken');
    expect(note?.content).not.toContain('private body');
});

test('a lone bad item wakes the Agent with its note', async () => {
    const seed = await seedAgent(connection.db);
    const { wake } = offlineDelivery(connection.db, seed);
    await queueUnrenderable(seed, 'msg_alone');

    const frame = await wake();

    const broken = await readRow(seed, 'msg_alone');
    const [item] = frame?.inbox ?? [];
    expect(item?.id).toBe(`undelivered:${broken?.id}`);
    expect(item?.senderType).toBe('system');
    expect(item?.content).toContain("1 item wasn't delivered");
});

test('a rejected start sets the named item aside and resends the rest with no pause', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    const first = await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    const second = await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    const frame = await wake();
    expect(frame?.inbox.map((item) => item.id)).toContain(first);

    await settleTurn(connection.db, delivery, seed.computerId, {
        activity: { operations: [] },
        agentId: seed.agentId,
        endedAt: new Date().toISOString(),
        failureCode: 'start-rejected',
        failureKind: 'configuration',
        messageCount: 0,
        modelId: frame?.modelId ?? 'model',
        outputProduced: false,
        rejectedItems: [{ id: first, reason: 'The Computer could not read this inbox item.' }],
        runId: frame?.runId ?? 'run',
        runtimeId: frame?.runtimeId ?? 'runtime',
        startedAt: new Date().toISOString(),
        status: 'failed',
        summary: 'Rejected.',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    });

    expect(await readDelivery(seed)).toMatchObject({ consecutiveFailures: 0, pausedAt: null });
    await finishTurn(delivery, seed, transport.framesOfType('start').at(-1));
    const ids =
        transport
            .framesOfType('start')
            .at(-1)
            ?.inbox.map((item) => item.id) ?? [];
    expect(ids).toContain(second);
    expect(ids).not.toContain(first);
    expect((await readRow(seed, first))?.undeliveredReason).toContain('could not read');
});

test('a Computer attaching clears a start-rejected pause on its Agents only', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery } = offlineDelivery(connection.db, seed);
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    const now = new Date();
    const held = {
        consecutiveFailures: 1,
        lastFailureAt: now,
        lastFailureCode: 'start-rejected',
        lastFailureKind: 'configuration',
        pausedAt: now,
        pauseStep: 0,
        retryAfter: new Date(now.getTime() + 3_600_000),
    } as const;
    await connection.db
        .update(agentDeliveryTable)
        .set(held)
        .where(eq(agentDeliveryTable.agentId, seed.agentId));

    await clearStartRejectedHolds(connection.db, 'cmp_other');
    expect((await readDelivery(seed))?.pausedAt).not.toBeNull();

    await clearStartRejectedHolds(connection.db, seed.computerId);
    expect(await readDelivery(seed)).toMatchObject({ consecutiveFailures: 0, pausedAt: null });
});

async function readDelivery(seed: Seed) {
    const [state] = await connection.db
        .select()
        .from(agentDeliveryTable)
        .where(eq(agentDeliveryTable.agentId, seed.agentId));
    return state;
}
