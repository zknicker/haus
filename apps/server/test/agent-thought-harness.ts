import type { AgentThoughtFrame } from '@haus/api';
import type {
    ThoughtSource,
    ThoughtSummarizer,
    ThoughtSummary,
} from '../src/server-agents/agent-thought-summarizer.ts';
import { thoughtStillAfterMs } from '../src/server-agents/thought-cadence.ts';

/** Shared fixtures for the Server thought tests (ADR 0036). */
export const at = '2026-09-24T12:00:00.000Z';
export const excerpt =
    'Let me compare the Halloween bids with last week before replying to the user.';

/**
 * Long enough that any line may show, new or continuing, and shorter than the
 * lines' ten-minute memory.
 */
export const pastThoughtGap = thoughtStillAfterMs;

/** A fake timer queue for the cadence: `advance` runs what falls due on the fake clock. */
export function fakeTimers(clock: { now: number }) {
    const timers = new Set<{ at: number; run: () => void }>();
    return {
        advance(ms: number) {
            clock.now += ms;
            for (const timer of [...timers].sort((a, b) => a.at - b.at)) {
                if (timer.at <= clock.now) {
                    timers.delete(timer);
                    timer.run();
                }
            }
        },
        schedule(run: () => void, ms: number) {
            const timer = { at: clock.now + ms, run };
            timers.add(timer);
            return () => timers.delete(timer);
        },
    };
}

export function collectBackground() {
    const tasks: Promise<void>[] = [];
    return {
        run: (_operation: string, work: () => Promise<unknown>) => {
            const task = work().then(() => undefined);
            tasks.push(task);
            return task;
        },
        tasks,
    };
}

export function fakeSummarizer(answer: (source: ThoughtSource) => Promise<ThoughtSummary | null>) {
    const seen: ThoughtSource[] = [];
    const summarizer: ThoughtSummarizer = {
        summarize: (source) => {
            seen.push(source);
            return answer(source);
        },
    };
    return { seen, summarizer };
}

export function phrase(agentId: string, runId: string): AgentThoughtFrame {
    return {
        agentId,
        at,
        kind: 'phrase',
        runId,
        text: 'Checking Halloween bid changes',
        type: 'agent-thought',
    };
}

export function reasoning(agentId: string, runId: string): AgentThoughtFrame {
    return { agentId, at, kind: 'reasoning', reasoning: excerpt, runId, type: 'agent-thought' };
}
