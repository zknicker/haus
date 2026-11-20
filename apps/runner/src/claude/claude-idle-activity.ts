import type { RuntimeTokenUsage } from '../turn/turn-event.ts';
import type { ClaudeModelUsage, ClaudeUsage, ParsedClaudeMessage } from './claude-messages.ts';
import { type IdleCompactionSnapshot, ONE_HOUR_CACHE_MS } from './idle-compaction.ts';

const fiveMinuteCacheMs = 5 * 60_000;

export interface ClaudeCumulativeUsage {
    readonly costUsd: number | null;
    readonly models: Readonly<Record<string, ClaudeModelUsage>>;
}

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

    get cumulative() {
        return this.totals;
    }

    snapshot() {
        if (!this.request) {
            return null;
        }
        const snapshot: IdleCompactionSnapshot = {
            ...this.request,
            minTokens: this.minTokens,
            nearUsageLimit: this.rateLimitStatus !== null && this.rateLimitStatus !== 'allowed',
        };
        return snapshot;
    }

    compacted(tokensAfter: number | null) {
        if (this.request && tokensAfter !== null) {
            this.request = { ...this.request, contextTokens: tokensAfter };
        }
    }

    observe({ message }: ParsedClaudeMessage) {
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

export function cumulativeDifference(before: ClaudeCumulativeUsage, after: ClaudeCumulativeUsage) {
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
    const usage: RuntimeTokenUsage | null =
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

function cacheTtl(usage: ClaudeUsage) {
    if ((usage.cache_creation?.ephemeral_1h_input_tokens ?? 0) > 0) {
        return ONE_HOUR_CACHE_MS;
    }
    if ((usage.cache_creation?.ephemeral_5m_input_tokens ?? 0) > 0) {
        return fiveMinuteCacheMs;
    }
    return null;
}

function delta(after: number | null | undefined, before: number | null | undefined) {
    return Math.max(0, (after ?? 0) - (before ?? 0));
}
