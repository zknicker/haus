import type { AgentThoughtContent } from '@haus/api';
import type { ComputerAgentActivityUpdate } from './agent-activity.ts';

/**
 * The run-scoped presentation frames a turn sends to the Server: semantic
 * activity and thoughts (a finished phrase or a reasoning excerpt). A disconnected Server drops
 * them; presentation must never fail a model turn.
 */
export function createRunFrames(input: {
    agentId: string;
    runId: string;
    sendFrame: (frame: unknown) => void;
}) {
    let activitySequence = 0;
    const send = (frame: unknown) => {
        try {
            input.sendFrame(frame);
        } catch {
            // Disconnected presentation must not fail a model turn.
        }
    };
    return {
        activity(activity: ComputerAgentActivityUpdate) {
            send({
                agentId: input.agentId,
                category: activity.category,
                occurredAt: activity.occurredAt,
                phase: activity.phase,
                producerSequence: ++activitySequence,
                runId: input.runId,
                ...(activity.toolRef ? { toolRef: activity.toolRef } : {}),
                type: 'agent-activity' as const,
            });
        },
        thought(thought: AgentThoughtContent) {
            send({ agentId: input.agentId, runId: input.runId, ...thought, type: 'agent-thought' });
        },
    };
}
