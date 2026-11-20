import type { AgentStartCommand, AgentTurnSummary } from '@haus/api';
import type { RunTurnResult } from './run-turn.ts';
import { turnFailureFields } from './turn-failure.ts';

export function turnSummary(input: {
    activity: AgentTurnSummary['activity'];
    dispatched: boolean;
    endedAt: string;
    result: RunTurnResult;
    sendCount: number;
    start: Pick<AgentStartCommand, 'agentId' | 'modelId' | 'runId' | 'runtimeId'>;
    startedAt: string;
    visibleMessages: AgentTurnSummary['visibleMessages'];
}) {
    const { result, sendCount, start } = input;
    const summary: AgentTurnSummary = {
        activity: input.activity,
        agentId: start.agentId,
        endedAt: input.endedAt,
        messageCount: sendCount,
        modelId: start.modelId,
        outputProduced: sendCount > 0 || input.dispatched,
        runId: start.runId,
        runtimeId: start.runtimeId,
        startedAt: input.startedAt,
        status: result.status,
        summary: summaryText(result.status, sendCount),
        tokenUsage: result.tokenUsage,
        type: 'turn',
        visibleMessages: input.visibleMessages,
        ...(result.status === 'failed' ? turnFailureFields(result.failure) : {}),
    };
    return summary;
}

function summaryText(status: AgentTurnSummary['status'], sendCount: number) {
    if (status === 'completed') {
        return `Sent ${sendCount} message(s).`;
    }
    return status === 'interrupted'
        ? 'The Agent turn was interrupted.'
        : 'The Agent turn did not complete.';
}
