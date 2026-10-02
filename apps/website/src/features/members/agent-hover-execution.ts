import type { Agent, AgentReasoningEffort } from '@haus/api';

export function resolveAgentHoverModelChange(
    agent: Pick<
        Agent,
        | 'availability'
        | 'desiredModelId'
        | 'desiredRuntimeId'
        | 'effectiveModelId'
        | 'effectiveRuntimeId'
        | 'status'
    >
): string | null {
    if (
        !(agent.effectiveModelId && agent.effectiveRuntimeId) ||
        (agent.desiredModelId === agent.effectiveModelId &&
            agent.desiredRuntimeId === agent.effectiveRuntimeId)
    ) {
        return null;
    }
    if (agent.status === 'degraded') {
        return 'needs attention';
    }
    return agent.availability === 'offline' ? 'when Computer reconnects' : 'next turn';
}

export type AgentHoverExecution =
    | {
          kind: 'effective';
          modelId: string;
          reasoningEffort: AgentReasoningEffort;
          runtimeId: string;
      }
    | { kind: 'unavailable'; label: string };

export function resolveAgentHoverExecution(
    agent: Pick<
        Agent,
        'effectiveModelId' | 'effectiveReasoningEffort' | 'effectiveRuntimeId' | 'status'
    >
): AgentHoverExecution {
    if (agent.effectiveModelId && agent.effectiveReasoningEffort && agent.effectiveRuntimeId) {
        return {
            kind: 'effective',
            modelId: agent.effectiveModelId,
            reasoningEffort: agent.effectiveReasoningEffort,
            runtimeId: agent.effectiveRuntimeId,
        };
    }

    return {
        kind: 'unavailable',
        label: agent.status === 'degraded' ? 'Configuration unavailable' : 'Configuration pending',
    };
}
