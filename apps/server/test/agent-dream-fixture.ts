import type { AgentTurnSummary } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { requestAgentHeartbeat } from '../src/agent-delivery/heartbeat-request.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentInboxTable, chatMessagesTable } from '../src/postgres/schema.ts';
import type { Seed } from './agent-inbox-harness.ts';

let agentSequence = 1_000_000;

/** One durable message the Agent itself posted, so it counts as having taken part. */
export async function agentSpeaks(
    db: HausDatabase,
    seed: Seed,
    chatId: string = seed.channelId,
    createdAt: Date = new Date()
) {
    agentSequence += 1;
    await db.insert(chatMessagesTable).values({
        authorAgentId: seed.agentId,
        chatId,
        content: 'on it',
        createdAt,
        id: createOpaqueId('msg'),
        nonce: createOpaqueId('nonce'),
        sequence: agentSequence,
        serverId: seed.serverId,
    });
}

export function requestHeartbeat(
    db: HausDatabase,
    delivery: AgentDelivery,
    seed: Seed,
    kind: 'daytime' | 'nightly',
    options: { computerId?: string; localDate?: string; slot?: string } = {}
) {
    return requestAgentHeartbeat(db, delivery, {
        computerId: options.computerId ?? seed.computerId,
        request: {
            agentId: seed.agentId,
            kind,
            localDate: options.localDate ?? '2026-10-11',
            slot: options.slot ?? (kind === 'nightly' ? '03:00' : '08:00'),
            type: 'agent-heartbeat-request',
        },
        serverId: seed.serverId,
    });
}

/** A nightly request from an Agent that spoke today, the shape the dream tests need. */
export async function requestDream(
    db: HausDatabase,
    delivery: AgentDelivery,
    seed: Seed,
    localDate = '2026-10-11'
) {
    await agentSpeaks(db, seed);
    return await requestHeartbeat(db, delivery, seed, 'nightly', { localDate });
}

export function settledTurn(
    seed: Seed,
    runId: string,
    visibleMessages: AgentTurnSummary['visibleMessages'] = []
): AgentTurnSummary {
    const now = new Date().toISOString();
    return {
        activity: { operations: [] },
        agentId: seed.agentId,
        endedAt: now,
        messageCount: 0,
        modelId: 'fake-model',
        outputProduced: false,
        runId,
        runtimeId: 'fake',
        startedAt: now,
        status: 'completed',
        summary: 'ok',
        tokenUsage: null,
        type: 'turn',
        visibleMessages,
    };
}

export async function dreamRows(db: HausDatabase, seed: Seed) {
    return await db
        .select({ chatId: agentInboxTable.chatId, state: agentInboxTable.state })
        .from(agentInboxTable)
        .where(and(eq(agentInboxTable.agentId, seed.agentId), eq(agentInboxTable.source, 'dream')));
}
