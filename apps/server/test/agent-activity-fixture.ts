import type { AgentActivityFrame, AgentTurnSummary } from '@haus/api';

export function activityFrame(
    seed: Pick<AgentActivityFrame, 'agentId'>,
    runId: string,
    producerSequence: number
): AgentActivityFrame {
    return {
        agentId: seed.agentId,
        category: 'using_tool',
        occurredAt: '2020-01-01T00:00:00.000Z',
        phase: 'started',
        producerSequence,
        runId,
        type: 'agent-activity',
    };
}

export function summary(
    seed: Pick<AgentActivityFrame, 'agentId'>,
    runId: string
): AgentTurnSummary {
    return {
        activity: { operations: [] },
        agentId: seed.agentId,
        endedAt: '2026-08-11T12:00:00.000Z',
        messageCount: 0,
        modelId: 'gpt-test',
        outputProduced: false,
        runId,
        runtimeId: 'codex',
        startedAt: '2026-08-11T11:59:00.000Z',
        status: 'completed',
        summary: 'done',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}
