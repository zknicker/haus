import type { RuntimeTokenUsage } from '../turn-event.ts';
import type { CodexTokenBreakdown } from './protocol.ts';

/**
 * Codex reports usage per model request: `thread/tokenUsage/updated` carries that request
 * (`last`) and the thread's running total. A turn's usage is the sum of its requests; an update
 * that only re-sends the previous total (as a turn opens) is no request. Input includes cached
 * input, as Claude Code reports it, so `totalTokens` is input plus output.
 */
export class CodexUsageLedger {
    private lastTotal: CodexTokenBreakdown | null = null;
    private turn: RuntimeTokenUsage | null = null;

    /** Starts counting a new turn's requests. */
    beginTurn(): void {
        this.turn = null;
    }

    /** One usage update; the request it reports, or `null` for a re-sent total. */
    observe(update: { last: CodexTokenBreakdown; total: CodexTokenBreakdown }): {
        contextTokens: number;
        usage: RuntimeTokenUsage;
    } | null {
        const resent = this.lastTotal !== null && sameBreakdown(this.lastTotal, update.total);
        this.lastTotal = update.total;
        if (resent) {
            return null;
        }
        const usage = runtimeUsage(update.last);
        this.turn = addUsage(this.turn, usage);
        return { contextTokens: update.last.inputTokens, usage };
    }

    /** The current turn's summed requests, `null` when it made none. */
    turnUsage(): RuntimeTokenUsage | null {
        return this.turn;
    }
}

function runtimeUsage(breakdown: CodexTokenBreakdown): RuntimeTokenUsage {
    return {
        cacheReadTokens: breakdown.cachedInputTokens ?? 0,
        cacheWriteTokens: breakdown.cacheWriteInputTokens ?? 0,
        inputTokens: breakdown.inputTokens,
        outputTokens: breakdown.outputTokens,
        totalTokens: breakdown.inputTokens + breakdown.outputTokens,
    };
}

function addUsage(current: RuntimeTokenUsage | null, next: RuntimeTokenUsage): RuntimeTokenUsage {
    if (!current) {
        return next;
    }
    return {
        cacheReadTokens: current.cacheReadTokens + next.cacheReadTokens,
        cacheWriteTokens: current.cacheWriteTokens + next.cacheWriteTokens,
        inputTokens: current.inputTokens + next.inputTokens,
        outputTokens: current.outputTokens + next.outputTokens,
        totalTokens: current.totalTokens + next.totalTokens,
    };
}

function sameBreakdown(a: CodexTokenBreakdown, b: CodexTokenBreakdown): boolean {
    return (
        a.inputTokens === b.inputTokens &&
        a.outputTokens === b.outputTokens &&
        (a.cachedInputTokens ?? 0) === (b.cachedInputTokens ?? 0) &&
        (a.totalTokens ?? 0) === (b.totalTokens ?? 0)
    );
}
