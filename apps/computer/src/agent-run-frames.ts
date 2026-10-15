import type { AgentThoughtContent, AgentTurnActivitySummary } from '@haus/api';
import type { EffectRuntime } from '@haus/effect';
import type { ComputerAgentActivityUpdate } from './agent-activity.ts';
import { AgentActivityRun } from './agent-activity-run.ts';
import { createAgentThoughtNarrator } from './harness/thought-narrator.ts';

/** One run's presentation: semantic activity and the thought narrator, sharing one frame sender. */
export function createRunPresentation(input: {
    agentId: string;
    ledger: {
        record(summary: AgentTurnActivitySummary): void;
        seed?: AgentTurnActivitySummary;
    };
    runId: string;
    runtime: EffectRuntime<never>;
    sendFrame: (frame: unknown) => void;
}) {
    const frames = createRunFrames(input);
    const activity = new AgentActivityRun(input.runtime, frames.activity, {
        onCounts: (summary) => input.ledger.record(summary),
        seed: input.ledger.seed,
    });
    return { activity, thoughts: createAgentThoughtNarrator({ emit: frames.thought }) };
}

/**
 * The run-scoped presentation frames a turn sends to the Server: semantic
 * activity and thoughts (a finished phrase, a reasoning excerpt, or a scrubbed
 * action description). A disconnected Server drops them; presentation must
 * never fail a model turn.
 */
function createRunFrames(input: {
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
                ...(activity.operationId ? { operationId: activity.operationId } : {}),
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
