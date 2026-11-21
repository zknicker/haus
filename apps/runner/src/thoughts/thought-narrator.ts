import {
    type AgentThoughtContent,
    agentThoughtActionMaxLength,
    agentThoughtResultMaxLength,
    agentThoughtTextMaxLength,
    extractThoughtTitle,
    thoughtReasoningExcerpt,
} from '@haus/api';
import type { TurnEvent } from '../turn/turn-event.ts';

export const thoughtIntervalMs = 4000;

export type ReasoningTurnEvent = Extract<
    TurnEvent,
    { type: 'reasoning-delta' | 'reasoning-end' | 'reasoning-start' }
>;

export interface AgentThoughtNarrator {
    close(): void;
    observe(part: ReasoningTurnEvent): void;
    observeAction(action: string | null, result?: string): void;
}

export function createAgentThoughtNarrator(input: {
    emit: (thought: AgentThoughtContent) => void;
    now?: () => number;
    redact: (text: string) => string;
    schedule?: (run: () => void, ms: number) => () => void;
}) {
    const now = input.now ?? Date.now;
    const schedule = input.schedule ?? scheduleTimeout;
    const blocks = new Map<string, string>();
    let lastReleasedAt: number | null = null;
    let waiting: ThoughtCandidate | null = null;
    let cancelWait: (() => void) | null = null;
    let closed = false;

    const release = (thought: ThoughtCandidate) => {
        lastReleasedAt = now();
        input.emit({ at: new Date(lastReleasedAt).toISOString(), ...thought });
    };
    const offer = (thought: ThoughtCandidate | null) => {
        if (!thought || closed) {
            return;
        }
        const wait = lastReleasedAt === null ? 0 : lastReleasedAt + thoughtIntervalMs - now();
        if (wait <= 0) {
            release(thought);
            return;
        }
        if (waiting !== null && candidateRank(thought) < candidateRank(waiting)) {
            return;
        }
        waiting =
            waiting?.kind === 'action' &&
            thought.kind === 'action' &&
            waiting.result &&
            thought.result
                ? mergeFindings(waiting, thought)
                : thought;
        cancelWait ??= schedule(() => {
            cancelWait = null;
            const next = waiting;
            waiting = null;
            if (next !== null && !closed) {
                release(next);
            }
        }, wait);
    };

    const narrator: AgentThoughtNarrator = {
        close() {
            closed = true;
            blocks.clear();
            waiting = null;
            cancelWait?.();
            cancelWait = null;
        },
        observe(part) {
            const id = part.id.length > 0 ? part.id : undefined;
            if (closed || !id) {
                return;
            }
            if (part.type === 'reasoning-start') {
                blocks.set(id, '');
                return;
            }
            if (part.type === 'reasoning-delta') {
                blocks.set(id, (blocks.get(id) ?? '') + part.text);
                return;
            }
            const reasoning = blocks.get(id);
            blocks.delete(id);
            if (reasoning) {
                offer(thoughtCandidate(reasoning, input.redact));
            }
        },
        observeAction(action, result) {
            const described = action ? clip(input.redact(action), agentThoughtActionMaxLength) : '';
            const finding = result ? clip(input.redact(result), agentThoughtResultMaxLength) : '';
            offer(
                described
                    ? { action: described, kind: 'action', ...(finding ? { result: finding } : {}) }
                    : null
            );
        },
    };
    return narrator;
}

function scheduleTimeout(run: () => void, ms: number) {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
}

type ThoughtCandidate =
    | { action: string; kind: 'action'; result?: string }
    | { kind: 'phrase'; text: string }
    | { kind: 'reasoning'; reasoning: string };

function mergeFindings(
    first: { action: string; result?: string },
    second: { action: string; result?: string }
) {
    const half = Math.floor((agentThoughtResultMaxLength - 1) / 2);
    const merged: ThoughtCandidate = {
        action: clip(`${first.action}; ${second.action}`, agentThoughtActionMaxLength),
        kind: 'action',
        result: `${clip(first.result ?? '', half)}\n${clip(second.result ?? '', half)}`,
    };
    return merged;
}

function clip(text: string, max: number) {
    return text.length <= max
        ? text
        : text
              .slice(0, max)
              .replace(/\s+\S*$/u, '')
              .trim();
}

function candidateRank(thought: ThoughtCandidate) {
    if (thought.kind !== 'action') {
        return 1;
    }
    return thought.result ? 2 : 0;
}

function thoughtCandidate(reasoning: string, redact: (text: string) => string) {
    const title = extractThoughtTitle(reasoning);
    if (title) {
        const text = clip(redact(title), agentThoughtTextMaxLength);
        const phrase: ThoughtCandidate | null = text ? { kind: 'phrase', text } : null;
        return phrase;
    }
    const excerpt = thoughtReasoningExcerpt(redact(reasoning));
    const candidate: ThoughtCandidate | null = excerpt
        ? { kind: 'reasoning', reasoning: excerpt }
        : null;
    return candidate;
}
