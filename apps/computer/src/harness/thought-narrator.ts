import { resolveRuntimeById } from '../runtime-discovery.ts';
import {
    condenseThoughtLocally,
    extractThoughtTitle,
    thoughtMinimumReasoningLength,
} from './thought-phrase.ts';
import { createClaudeCodeThoughtSummarizer, type ThoughtSummarizer } from './thought-summarizer.ts';

/** At most one thought per run in this window; later blocks inside it are dropped. */
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
 * a Codex-style bold title as-is; otherwise Haiku for Claude Code reasoning
 * when a summarizer is available (the text already came from Anthropic);
 * otherwise a local condensation. Only the phrase reaches `emit`.
 */
export function createAgentThoughtNarrator(input: {
    emit: (thought: AgentThought) => void;
    now?: () => number;
    runtimeId: string;
    summarizer?: ThoughtSummarizer | null;
}): AgentThoughtNarrator {
    const now = input.now ?? Date.now;
    const summarizer = input.runtimeId === 'claude-code' ? (input.summarizer ?? null) : null;
    const blocks = new Map<string, string>();
    let lastAdmittedAt: number | null = null;
    let closed = false;

    const admit = () => {
        const at = now();
        if (lastAdmittedAt !== null && at - lastAdmittedAt < thoughtIntervalMs) {
            return false;
        }
        lastAdmittedAt = at;
        return true;
    };
    const emit = (text: string | null) => {
        if (text && !closed) {
            input.emit({ at: new Date(now()).toISOString(), text });
        }
    };
    const finishBlock = (reasoning: string) => {
        const title = extractThoughtTitle(reasoning);
        if (title) {
            if (admit()) {
                emit(title);
            }
            return;
        }
        if (reasoning.trim().length < thoughtMinimumReasoningLength || !admit()) {
            return;
        }
        if (!summarizer) {
            emit(condenseThoughtLocally(reasoning));
            return;
        }
        // A failed or late summary is dropped rather than replaced by a guess.
        summarizer.summarize(reasoning).then(emit, () => undefined);
    };

    return {
        close() {
            closed = true;
            blocks.clear();
        },
        observe(part) {
            const id = typeof part.id === 'string' && part.id.length > 0 ? part.id : undefined;
            if (closed || !id) {
                return;
            }
            if (part.type === 'reasoning-start') {
                blocks.set(id, '');
                summarizer?.warm();
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

let sharedSummarizer: ThoughtSummarizer | null | undefined;

/** One Haiku process per Computer, through the Claude Code login it already runs; null without one. */
export function sharedThoughtSummarizer(): ThoughtSummarizer | null {
    if (sharedSummarizer === undefined) {
        const executable = resolveRuntimeById('claude-code')?.path;
        sharedSummarizer = executable ? createClaudeCodeThoughtSummarizer({ executable }) : null;
    }
    return sharedSummarizer;
}
