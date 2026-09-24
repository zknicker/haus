import {
    condenseThoughtLocally,
    extractThoughtTitle,
    thoughtMinimumReasoningLength,
} from './thought-phrase.ts';
import { createGeminiThoughtSummarizer, type ThoughtSummarizer } from './thought-summarizer.ts';

/**
 * At most one thought per run in this window. Blocks that finish inside it
 * wait in one slot, newest wins, and the survivor goes out when it closes.
 */
export const thoughtIntervalMs = 4000;

export interface AgentThought {
    at: string;
    text: string;
}

/** Turns one run's reasoning stream into occasional short thoughts (prototype, ADR 0036). */
export interface AgentThoughtNarrator {
    /** Drops open blocks and ignores summaries still in flight. */
    close(): void;
    observe(part: Record<string, unknown>): void;
}

/** `HAUS_AGENT_THOUGHTS=true` turns thoughts on; the schema enables it only in local development. */
export function agentThoughtsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    return env.HAUS_AGENT_THOUGHTS === 'true';
}

/**
 * Collects each reasoning block and, when it ends, produces one phrase:
 * a Codex-style bold title as-is; otherwise the Gemini summarizer when a key
 * is configured; otherwise a local condensation. Only the phrase reaches `emit`.
 */
export function createAgentThoughtNarrator(input: {
    emit: (thought: AgentThought) => void;
    now?: () => number;
    /** Runs `run` after `ms`; returns a cancel. Defaults to `setTimeout`. */
    schedule?: (run: () => void, ms: number) => () => void;
    summarizer?: ThoughtSummarizer | null;
}): AgentThoughtNarrator {
    const now = input.now ?? Date.now;
    const schedule = input.schedule ?? scheduleTimeout;
    const summarizer = input.summarizer ?? null;
    const blocks = new Map<string, string>();
    let lastReleasedAt: number | null = null;
    // Only the newest waiting block survives, so a burst never queues up.
    let waiting: string | null = null;
    let cancelWait: (() => void) | null = null;
    let closed = false;

    const emit = (text: string | null) => {
        if (text && !closed) {
            input.emit({ at: new Date(now()).toISOString(), text });
        }
    };
    const release = (reasoning: string) => {
        lastReleasedAt = now();
        const title = extractThoughtTitle(reasoning);
        if (title) {
            emit(title);
        } else if (summarizer) {
            // A failed or late summary is dropped rather than replaced by a guess.
            summarizer.summarize(reasoning).then(emit, () => undefined);
        } else {
            emit(condenseThoughtLocally(reasoning));
        }
    };
    const finishBlock = (reasoning: string) => {
        if (
            !extractThoughtTitle(reasoning) &&
            reasoning.trim().length < thoughtMinimumReasoningLength
        ) {
            return;
        }
        const wait = lastReleasedAt === null ? 0 : lastReleasedAt + thoughtIntervalMs - now();
        if (wait <= 0) {
            release(reasoning);
            return;
        }
        waiting = reasoning;
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

/** The Gemini summarizer when `HAUS_GEMINI_API_KEY` is configured; null falls back to the heuristic. */
export function thoughtSummarizerFromEnv(
    env: NodeJS.ProcessEnv = process.env
): ThoughtSummarizer | null {
    const apiKey = env.HAUS_GEMINI_API_KEY?.trim();
    return apiKey ? createGeminiThoughtSummarizer({ apiKey }) : null;
}
