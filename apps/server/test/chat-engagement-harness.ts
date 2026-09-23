import type { AgentTurnSummary } from '@haus/api';
import { eq, max } from 'drizzle-orm';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    channelAgentParticipantsTable,
    chatMessagesTable,
    chatsTable,
} from '../src/postgres/schema.ts';
import { offlineDelivery, type Seed, seedAgent } from './agent-inbox-harness.ts';

/** The next free sequence in a Chat, so human and Agent writes interleave in commit order. */
async function nextSequence(db: HausDatabase, chatId: string) {
    const [head] = await db
        .select({ sequence: max(chatMessagesTable.sequence) })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.chatId, chatId));
    return (head?.sequence ?? 0) + 1;
}

/** A human message in a Chat, planned into the Agent's inbox, with the Chat head advanced. */
export async function post(
    db: HausDatabase,
    seed: Seed,
    delivery: ReturnType<typeof offlineDelivery>['delivery'],
    chatId: string,
    content = 'Can you check the deploy?'
) {
    const id = createOpaqueId('msg');
    const sequence = await nextSequence(db, chatId);
    await db.insert(chatMessagesTable).values({
        authorUserId: seed.userId,
        chatId,
        content,
        id,
        nonce: createOpaqueId('nonce'),
        sequence,
        serverId: seed.serverId,
    });
    await delivery.deliver({
        agentId: seed.agentId,
        chatId,
        content,
        dedupeKey: id,
        sequence,
        serverId: seed.serverId,
        source: 'human',
    });
    await db
        .update(chatsTable)
        .set({ lastMessageSequence: sequence })
        .where(eq(chatsTable.id, chatId));
    return { chatId, id, sequence };
}

/** A message authored by an Agent, committed after everything already in the Chat. */
export async function agentPost(
    db: HausDatabase,
    seed: Seed,
    chatId: string,
    agentId = seed.agentId
) {
    const id = createOpaqueId('msg');
    const sequence = await nextSequence(db, chatId);
    await db.insert(chatMessagesTable).values({
        authorAgentId: agentId,
        chatId,
        content: 'On it.',
        id,
        nonce: createOpaqueId('nonce'),
        sequence,
        serverId: seed.serverId,
        sessionGeneration: 1,
    });
    return { chatId, id, sequence };
}

/** Wakes the Agent on a channel message and accepts the run. */
export async function wakeOn(db: HausDatabase, content = 'Can you check the deploy?') {
    const seed = await seedAgent(db);
    await db.insert(channelAgentParticipantsTable).values({
        agentId: seed.agentId,
        chatId: seed.channelId,
        id: createOpaqueId('cap'),
        serverId: seed.serverId,
    });
    const { delivery, wake } = offlineDelivery(db, seed);
    const wakeMessage = await post(db, seed, delivery, seed.channelId, content);
    const start = await wake();
    const runId = start?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    const runner = {
        agentId: seed.agentId,
        capabilities: [],
        chatId: seed.channelId,
        computerId: seed.computerId,
        runId,
        runnerId: createOpaqueId('arc'),
        serverId: seed.serverId,
    };
    return { delivery, runner, seed, wakeMessage };
}

export function settledSummary(agentId: string, runId: string): AgentTurnSummary {
    return {
        activity: { operations: [] },
        agentId,
        endedAt: new Date().toISOString(),
        messageCount: 0,
        modelId: 'fake-model',
        outputProduced: false,
        runId,
        runtimeId: 'fake',
        startedAt: new Date().toISOString(),
        status: 'completed',
        summary: 'ok',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}
