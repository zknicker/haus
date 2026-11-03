import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentTurnSummary } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { enqueueAgentGreeting, greetingDedupeKey } from '../src/agent-delivery/greeting.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentDeliveryTable, agentInboxTable } from '../src/postgres/schema.ts';
import {
    addChannel,
    deliverHuman,
    offlineDelivery,
    type Seed,
    seedAgent,
} from './agent-inbox-harness.ts';
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

test("the creation wake and the creator's @mention coalesce into one greeting turn", async () => {
    const seed = await seedAgent(connection.db);
    const allChannelId = await greet(seed);
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    // The creator answers the human where they asked and names the new Agent.
    const mentionId = await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'mention',
        chatId: seed.channelId,
        content: '@scout is here to own the delivery checks.',
        mentioned: true,
    });

    const start = await wake();

    expect(transport.framesOfType('start')).toHaveLength(1);
    expect(start).toMatchObject({ chatId: seed.channelId, greets: true });
    // The mention is drained into that one first turn; the greeting is never an item.
    expect(start?.drainItemIds).toEqual([mentionId]);
    expect(start?.inbox.map((item) => item.id)).toEqual([mentionId]);
    expect(start?.inbox.some((item) => item.chatId === allChannelId)).toBe(false);

    await settle(delivery, seed, start?.runId ?? '');

    expect(transport.framesOfType('start')).toHaveLength(1);
    expect(await greetingState(seed)).toBe('seen');
});

test('a mention landing during the greeting turn reaches it as a notice, never a second greeting', async () => {
    const seed = await seedAgent(connection.db);
    const allChannelId = await greet(seed);
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);

    // Alone, the greeting leads its own run in #all as soon as the Agent can run.
    const start = await wake();
    expect(start).toMatchObject({
        chatId: allChannelId,
        drainItemIds: [],
        greets: true,
        inbox: [],
        inboxDelivery: 'notice',
    });
    await delivery.onAck({ agentId: seed.agentId, runId: start?.runId ?? '' });

    const mentionId = await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'mention',
        chatId: seed.channelId,
        mentioned: true,
    });
    const [notice] = transport.framesOfType('notice');
    expect(notice?.runId).toBe(start?.runId ?? '');
    expect(notice?.inbox.map((item) => item.id)).toEqual([mentionId]);

    await settle(delivery, seed, start?.runId ?? '');

    // Any later turn carries no greeting: the one claim was consumed.
    expect(transport.framesOfType('start').filter((frame) => frame.greets)).toHaveLength(1);
    expect(await greetingState(seed)).toBe('seen');
});

test('the greeting is claimed once per Agent and survives a resend and a failed turn', async () => {
    const seed = await seedAgent(connection.db);
    await greet(seed);
    await greet(seed);
    expect(await greetingRows(seed)).toHaveLength(1);
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);

    const first = await wake();
    // An unacknowledged greeting run resends as itself, not as an empty notice to retire.
    await delivery.sweep();
    const resent = transport.framesOfType('start');
    expect(resent).toHaveLength(2);
    expect(resent[1]).toMatchObject({ greets: true, runId: first?.runId ?? '' });

    // A turn that fails before any output returns the greeting to the queue.
    await delivery.onAck({ agentId: seed.agentId, runId: first?.runId ?? '' });
    await delivery.onTurnSettled(seed.computerId, summary(seed, first?.runId ?? '', 'failed'));
    expect(await greetingState(seed)).toBe('queued');

    // Skip the failure backoff rather than wait it out.
    await connection.db
        .update(agentDeliveryTable)
        .set({ retryAfter: null })
        .where(eq(agentDeliveryTable.agentId, seed.agentId));
    await delivery.dispatchAgent(seed.agentId, seed.serverId);
    const retry = transport.framesOfType('start').at(-1);
    expect(retry?.runId).not.toBe(first?.runId);
    expect(retry?.greets).toBe(true);
    await settle(delivery, seed, retry?.runId ?? '');

    // Replaying creation after the greeting settled queues nothing new.
    await greet(seed);
    expect(await greetingRows(seed)).toHaveLength(1);
    expect(await greetingState(seed)).toBe('seen');
});

async function greet(seed: Seed): Promise<string> {
    const [existing] = await greetingRows(seed);
    const allChannelId = existing?.chatId ?? (await addChannel(connection.db, seed, 'all'));
    await enqueueAgentGreeting(connection.db, {
        agentId: seed.agentId,
        allChannelId,
        serverId: seed.serverId,
    });
    return allChannelId;
}

async function settle(delivery: AgentDelivery, seed: Seed, runId: string) {
    await delivery.onAck({ agentId: seed.agentId, runId });
    await delivery.onTurnSettled(seed.computerId, summary(seed, runId, 'completed'));
}

async function greetingRows(seed: Seed) {
    return await connection.db
        .select({ chatId: agentInboxTable.chatId, state: agentInboxTable.state })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.agentId, seed.agentId),
                eq(agentInboxTable.dedupeKey, greetingDedupeKey(seed.agentId))
            )
        );
}

async function greetingState(seed: Seed) {
    return (await greetingRows(seed))[0]?.state;
}

function summary(seed: Seed, runId: string, status: 'completed' | 'failed'): AgentTurnSummary {
    return {
        activity: { operations: [] },
        agentId: seed.agentId,
        endedAt: new Date().toISOString(),
        messageCount: status === 'completed' ? 1 : 0,
        modelId: 'fake-model',
        outputProduced: status === 'completed',
        runId,
        runtimeId: 'fake',
        startedAt: new Date().toISOString(),
        status,
        summary: 'ok',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}
