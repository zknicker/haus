import type { AgentTurnSummary } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { requestAgentDream } from '../src/agent-delivery/dream-request.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { agentInboxTable } from '../src/postgres/schema.ts';
import type { Seed } from './agent-inbox-harness.ts';

export function requestDream(
    db: HausDatabase,
    delivery: AgentDelivery,
    seed: Seed,
    localDate = '2026-10-11'
) {
    return requestAgentDream(db, delivery, {
        computerId: seed.computerId,
        request: { agentId: seed.agentId, localDate, type: 'agent-dream-request' },
        serverId: seed.serverId,
    });
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
