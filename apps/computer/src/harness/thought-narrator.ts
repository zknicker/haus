import { type AgentThoughtContent, extractThoughtTitle, thoughtReasoningExcerpt } from '@haus/api';

/**
 * At most one thought per run in this window. Blocks that finish inside it
 * wait in one slot, newest wins, and the survivor goes out when it closes.
 */
export const thoughtIntervalMs = 4000;

/** Turns one run's reasoning stream into occasional thought frames (ADR 0036). */
export interface AgentThoughtNarrator {
    /** Drops open blocks and any thought still waiting for the interval. */
    close(): void;
    observe(part: Record<string, unknown>): void;
}

/**
 * Collects each reasoning block and, when it ends, sends one thought: a
 * Codex-style bold title as a finished phrase, with no network call;
 * otherwise a scrubbed excerpt the Server summarizes. The Computer's interval
 * is the authoritative rate limit.
 */
export function createAgentThoughtNarrator(input: {
    emit: (thought: AgentThoughtContent) => void;
    now?: () => number;
    /** Runs `run` after `ms`; returns a cancel. Defaults to `setTimeout`. */
    schedule?: (run: () => void, ms: number) => () => void;
}): AgentThoughtNarrator {
    const now = input.now ?? Date.now;
    const schedule = input.schedule ?? scheduleTimeout;
    const blocks = new Map<string, string>();
    let lastReleasedAt: number | null = null;
    // Only the newest waiting block survives, so a burst never queues up.
    let waiting: ThoughtCandidate | null = null;
    let cancelWait: (() => void) | null = null;
    let closed = false;

    const release = (thought: ThoughtCandidate) => {
        lastReleasedAt = now();
        input.emit({ at: new Date(lastReleasedAt).toISOString(), ...thought });
    };
    const finishBlock = (reasoning: string) => {
        const thought = thoughtCandidate(reasoning);
        if (!thought) {
            return;
        }
        const wait = lastReleasedAt === null ? 0 : lastReleasedAt + thoughtIntervalMs - now();
        if (wait <= 0) {
            release(thought);
            return;
        }
        waiting = thought;
        cancelWait ??= schedule(() => {
            cancelWait = null;
            const next = waiting;
            waiting = null;
            if (next !== null && !closed) {
                release(next);
            }
        }, wait);
    };

    return {
        close() {
            closed = true;
            blocks.clear();
            waiting = null;
            cancelWait?.();
            cancelWait = null;
        },
        observe(part) {
            const id = typeof part.id === 'string' && part.id.length > 0 ? part.id : undefined;
            if (closed || !id) {
                return;
            }
            if (part.type === 'reasoning-start') {
                blocks.set(id, '');
                return;
            }
            if (part.type === 'reasoning-delta' && typeof part.text === 'string') {
                blocks.set(id, (blocks.get(id) ?? '') + part.text);
                return;
            }
            if (part.type === 'reasoning-end') {
                const reasoning = blocks.get(id);
                blocks.delete(id);
                if (reasoning) {
                    finishBlock(reasoning);
                }
            }
        },
    };
}

function scheduleTimeout(run: () => void, ms: number) {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
}

type ThoughtCandidate = { kind: 'phrase'; text: string } | { kind: 'reasoning'; reasoning: string };

/** A title-led block becomes a phrase; any other long-enough block, an excerpt. */
function thoughtCandidate(reasoning: string): ThoughtCandidate | null {
    const title = extractThoughtTitle(reasoning);
    if (title) {
        return { kind: 'phrase', text: title };
    }
    const excerpt = thoughtReasoningExcerpt(reasoning);
    return excerpt ? { kind: 'reasoning', reasoning: excerpt } : null;
}
