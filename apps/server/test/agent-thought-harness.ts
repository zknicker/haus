import type { AgentThoughtFrame } from '@haus/api';
import type {
    ThoughtSource,
    ThoughtSummarizer,
    ThoughtSummary,
} from '../src/server-agents/agent-thought-summarizer.ts';

/** Shared fixtures for the Server thought tests (ADR 0036). */
export const at = '2026-09-24T12:00:00.000Z';
export const excerpt =
    'Let me compare the Halloween bids with last week before replying to the user.';

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
