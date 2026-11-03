import type { AgentSessionTokenUsage } from './session-store.ts';

export type HarnessTokenUsage = AgentSessionTokenUsage;

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
