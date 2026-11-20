import { type IdleCompactionSnapshot, ONE_HOUR_CACHE_MS } from '../idle-compaction.ts';
import type { RuntimeTokenUsage } from '../turn-event.ts';
import type { ClaudeModelUsage, ClaudeUsage, ParsedClaudeLine } from './claude-messages.ts';

/** Claude Code's five-minute prompt cache, the other lifetime a request may write. */
const fiveMinuteCacheMs = 5 * 60_000;

/** The process's running totals as its last result reported them. */
export interface ClaudeCumulativeUsage {
    readonly costUsd: number | null;
    readonly models: Readonly<Record<string, ClaudeModelUsage>>;
}

/**
 * What idle compaction needs to know about one `claude` process, read off its stream: the last
 * main-conversation request (when it answered, how big its prompt was, which cache lifetime it
 * wrote), whether the plan's usage limit is near, and the process's cumulative cost and usage,
 * which is the only place a compaction's own spend appears.
 */
export class ClaudeIdleActivity {
    private request: {
        activityAt: number;
        cacheTtlMs: number | null;
        contextTokens: number;
    } | null = null;
    private pendingUsage: ClaudeUsage | null = null;
    private rateLimitStatus: string | null = null;
    private totals: ClaudeCumulativeUsage = { costUsd: null, models: {} };

    constructor(
        private readonly minTokens: number,
        private readonly now: () => number = Date.now
    ) {}

    get cumulative(): ClaudeCumulativeUsage {
        return this.totals;
    }

    snapshot(): IdleCompactionSnapshot | null {
        if (!this.request) {
            return null;
        }
        return {
            ...this.request,
            minTokens: this.minTokens,
            nearUsageLimit: this.rateLimitStatus !== null && this.rateLimitStatus !== 'allowed',
        };
    }

    /** A compaction rewrote the conversation: its prompt is now the summary's size. */
    compacted(tokensAfter: number | null): void {
        if (this.request && tokensAfter !== null) {
            this.request = { ...this.request, contextTokens: tokensAfter };
        }
    }

    observe({ message }: ParsedClaudeLine): void {
        switch (message.kind) {
            case 'stream': {
                if (message.message.parent_tool_use_id) {
                    return;
                }
                const { event } = message.message;
                if (event.type === 'message_start') {
                    this.pendingUsage = event.message?.usage ?? null;
                } else if (event.type === 'message_stop' && this.pendingUsage) {
                    this.answered(this.pendingUsage);
                    this.pendingUsage = null;
                }
                return;
            }
            case 'rate-limit':
                this.rateLimitStatus =
                    message.message.rate_limit_info?.status ?? this.rateLimitStatus;
                return;
            case 'result':
                this.totals = {
                    costUsd: message.message.total_cost_usd ?? this.totals.costUsd,
                    models: message.message.modelUsage ?? this.totals.models,
                };
                return;
            default:
                return;
        }
    }

    /** The main conversation's request answered: Claude Code's `lastActivityAt` moves. */
    private answered(usage: ClaudeUsage) {
        const contextTokens =
            (usage.input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0);
        this.request = {
            activityAt: this.now(),
            cacheTtlMs: cacheTtl(usage) ?? this.request?.cacheTtlMs ?? null,
            contextTokens,
        };
    }
}

/**
 * The difference between two cumulative readings: what the requests between them spent. Null
 * usage when no model's totals moved.
 */
export function cumulativeDifference(
    before: ClaudeCumulativeUsage,
    after: ClaudeCumulativeUsage
): { costUsd: number | null; usage: RuntimeTokenUsage | null } {
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;
    let freshTokens = 0;
    let outputTokens = 0;
    for (const [model, totals] of Object.entries(after.models)) {
        const prior = before.models[model];
        cacheReadTokens += delta(totals.cacheReadInputTokens, prior?.cacheReadInputTokens);
        cacheWriteTokens += delta(totals.cacheCreationInputTokens, prior?.cacheCreationInputTokens);
        freshTokens += delta(totals.inputTokens, prior?.inputTokens);
        outputTokens += delta(totals.outputTokens, prior?.outputTokens);
    }
    const inputTokens = freshTokens + cacheReadTokens + cacheWriteTokens;
    const usage =
        inputTokens + outputTokens > 0
            ? {
                  cacheReadTokens,
                  cacheWriteTokens,
                  inputTokens,
                  outputTokens,
                  totalTokens: inputTokens + outputTokens,
              }
            : null;
    const costUsd =
        after.costUsd === null ? null : Math.max(0, after.costUsd - (before.costUsd ?? 0));
    return { costUsd, usage };
}

/**
 * A request that wrote cache says which lifetime; a full cache hit writes none and says
 * nothing, so the lifetime the session last wrote stands.
 */
function cacheTtl(usage: ClaudeUsage): number | null {
    if ((usage.cache_creation?.ephemeral_1h_input_tokens ?? 0) > 0) {
        return ONE_HOUR_CACHE_MS;
    }
    if ((usage.cache_creation?.ephemeral_5m_input_tokens ?? 0) > 0) {
        return fiveMinuteCacheMs;
    }
    return null;
}

function delta(after: number | null | undefined, before: number | null | undefined): number {
    return Math.max(0, (after ?? 0) - (before ?? 0));
}
