import { type ClaudeUsageSnapshot, normalizeClaudeUsageResponse } from '@haus/claude-usage';
import type { AgentSessionTokenUsage } from './session-store.ts';

export type HarnessTokenUsage = AgentSessionTokenUsage;

export function usageContextTokens(usage: unknown): number | null {
    if (!isRecord(usage)) {
        return null;
    }
    const inputTotal = tokenCount(usage.inputTokens);
    const outputTotal = tokenCount(usage.outputTokens);
    if (inputTotal === null && outputTotal === null) {
        return null;
    }
    return (inputTotal ?? 0) + (outputTotal ?? 0);
}

export function readTokenUsage(usage: unknown): HarnessTokenUsage | null {
    if (!isRecord(usage)) {
        return null;
    }
    const details = isRecord(usage.inputTokenDetails) ? usage.inputTokenDetails : null;
    const inputTokens = tokenCount(usage.inputTokens);
    const outputTokens = tokenCount(usage.outputTokens);
    const cacheReadTokens = tokenCount(details?.cacheReadTokens);
    const cacheWriteTokens = tokenCount(details?.cacheWriteTokens);
    if ([inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens].every((v) => v === null)) {
        return null;
    }
    return {
        cacheReadTokens: cacheReadTokens ?? 0,
        cacheWriteTokens: cacheWriteTokens ?? 0,
        inputTokens: inputTokens ?? 0,
        outputTokens: outputTokens ?? 0,
        totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0),
    };
}

export function addTokenUsage(
    current: HarnessTokenUsage | null,
    next: HarnessTokenUsage | null
): HarnessTokenUsage | null {
    if (!(current && next)) {
        return next ?? current;
    }
    return {
        cacheReadTokens: current.cacheReadTokens + next.cacheReadTokens,
        cacheWriteTokens: current.cacheWriteTokens + next.cacheWriteTokens,
        inputTokens: current.inputTokens + next.inputTokens,
        outputTokens: current.outputTokens + next.outputTokens,
        totalTokens: current.totalTokens + next.totalTokens,
    };
}

/** Claude Code reports subscription rate limits through the turn's provider metadata. */
export function readClaudePlanUsageMetadata(value: unknown): ClaudeUsageSnapshot | null {
    if (!isRecord(value)) {
        return null;
    }
    const claude = value['claude-code'];
    if (!(isRecord(claude) && isRecord(claude.planUsage))) {
        return null;
    }
    const usage = claude.planUsage;
    if (usage.rate_limits_available !== true || !isRecord(usage.rate_limits)) {
        return null;
    }
    try {
        return normalizeClaudeUsageResponse(usage.rate_limits, {
            source: 'claude-code-sdk-usage',
            subscriptionType:
                typeof usage.subscription_type === 'string' ? usage.subscription_type : null,
        });
    } catch {
        return null;
    }
}

function tokenCount(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
