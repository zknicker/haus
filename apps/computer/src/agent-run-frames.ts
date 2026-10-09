import type { AgentThoughtContent, AgentTurnActivitySummary } from '@haus/api';
import type { EffectRuntime } from '@haus/effect';
import type { ComputerAgentActivityUpdate } from './agent-activity.ts';
import { AgentActivityRun } from './agent-activity-run.ts';
import { createAgentThoughtNarrator } from './harness/thought-narrator.ts';

/** At most one journal-change notice per run in this window; the last change always gets one. */
export const journalChangeIntervalMs = 1000;

/**
 * One run's presentation: semantic activity (which also relays journal-change
 * notices) and the thought narrator, sharing one frame sender.
 */
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
        onJournalChange: frames.journalChanged,
        seed: input.ledger.seed,
    });
    return { activity, thoughts: createAgentThoughtNarrator({ emit: frames.thought }) };
}

/**
 * The run-scoped presentation frames a turn sends to the Server: semantic
 * activity, thoughts (a finished phrase, a reasoning excerpt, or a scrubbed action
 * description), and journal-change notices. A disconnected Server drops them;
 * presentation must never fail a model turn.
 */
export function createRunFrames(input: {
    agentId: string;
    runId: string;
    sendFrame: (frame: unknown) => void;
    now?: () => number;
    /** Runs `run` after `ms`. Defaults to an unref'd `setTimeout`. */
    schedule?: (run: () => void, ms: number) => void;
}) {
    const now = input.now ?? Date.now;
    let activitySequence = 0;
    let lastJournalNoticeAt: number | null = null;
    let journalNoticeWaiting = false;
    const schedule = input.schedule ?? scheduleTimeout;
    const send = (frame: unknown) => {
        try {
            input.sendFrame(frame);
        } catch {
            // Disconnected presentation must not fail a model turn.
        }
    };
    const sendJournalNotice = () => {
        lastJournalNoticeAt = now();
        send({
            agentId: input.agentId,
            runId: input.runId,
            type: 'agent-execution-journal-changed',
        });
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
        /** Throttled: reasoning flushes up to four times a second. */
        journalChanged() {
            if (journalNoticeWaiting) {
                return;
            }
            const wait =
                lastJournalNoticeAt === null
                    ? 0
                    : lastJournalNoticeAt + journalChangeIntervalMs - now();
            if (wait <= 0) {
                sendJournalNotice();
                return;
            }
            journalNoticeWaiting = true;
            schedule(() => {
                journalNoticeWaiting = false;
                sendJournalNotice();
            }, wait);
        },
        thought(thought: AgentThoughtContent) {
            send({ agentId: input.agentId, runId: input.runId, ...thought, type: 'agent-thought' });
        },
    };
}

function scheduleTimeout(run: () => void, ms: number) {
    setTimeout(run, ms).unref?.();
}
