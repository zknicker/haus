import {
    type AgentThoughtContent,
    agentThoughtActionMaxLength,
    agentThoughtResultMaxLength,
    extractThoughtTitle,
    thoughtReasoningExcerpt,
} from '@haus/api';

/**
 * At most one thought per run in this window, whatever its kind. Candidates
 * that arrive inside it wait in one slot, newest wins, and the survivor goes
 * out when it closes, with one ranking: a finished action with a result beats
 * a title or excerpt, which beats a bare started action. A finding is the most
 * a person can learn, and the model's own words beat inferred ones.
 */
export const thoughtIntervalMs = 4000;

/** Turns one run's reasoning and tool actions into occasional thought frames (ADR 0036). */
export interface AgentThoughtNarrator {
    /** Drops open blocks and any thought still waiting for the interval. */
    close(): void;
    observe(part: Record<string, unknown>): void;
    /**
     * Offers a tool action's scrubbed description (`thought-action.ts`), with
     * a scrubbed excerpt of its output once it has finished
     * (`thought-result.ts`); a null action is ignored.
     */
    observeAction(action: string | null, result?: string): void;
}

/**
 * Collects each reasoning block and, when it ends, sends one thought: a
 * Codex-style bold title as a finished phrase, otherwise a scrubbed excerpt.
 * A started tool action becomes an `action` thought too, since Codex often
 * reasons only before and after its tools. The Server rephrases any of them or
 * drops it as housekeeping. The Computer's interval is the authoritative rate limit.
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
    // Only the newest waiting candidate survives, so a burst never queues up.
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
        // Parallel fetches finish together; both results ride one frame rather than the newest alone.
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
                    offer(thoughtCandidate(reasoning));
                }
            }
        },
        observeAction(action, result) {
            offer(action ? { action, kind: 'action', ...(result ? { result } : {}) } : null);
        },
    };
}

function scheduleTimeout(run: () => void, ms: number) {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
}

type ThoughtCandidate =
    | { action: string; kind: 'action'; result?: string }
    | { kind: 'phrase'; text: string }
    | { kind: 'reasoning'; reasoning: string };

/** Two finished actions as one: both descriptions and both results, each result halved. */
function mergeFindings(
    first: { action: string; result?: string },
    second: { action: string; result?: string }
): ThoughtCandidate {
    // Two halves and the line break between them still fit the cap.
    const half = Math.floor((agentThoughtResultMaxLength - 1) / 2);
    return {
        action: clip(`${first.action}; ${second.action}`, agentThoughtActionMaxLength),
        kind: 'action',
        result: `${clip(first.result ?? '', half)}\n${clip(second.result ?? '', half)}`,
    };
}

function clip(text: string, max: number): string {
    return text.length <= max
        ? text
        : text
              .slice(0, max)
              .replace(/\s+\S*$/u, '')
              .trim();
}

/** A finding outranks the model's own words, which outrank an inferred action. */
function candidateRank(thought: ThoughtCandidate): number {
    if (thought.kind !== 'action') {
        return 1;
    }
    return thought.result ? 2 : 0;
}

/** A title-led block becomes a phrase; any other long-enough block, an excerpt. */
function thoughtCandidate(reasoning: string): ThoughtCandidate | null {
    const title = extractThoughtTitle(reasoning);
    if (title) {
        return { kind: 'phrase', text: title };
    }
    const excerpt = thoughtReasoningExcerpt(reasoning);
    return excerpt ? { kind: 'reasoning', reasoning: excerpt } : null;
}
