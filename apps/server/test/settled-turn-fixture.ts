import type { AgentTurnSummary } from '@haus/api';

import type { Seed } from './agent-inbox-harness.ts';

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
