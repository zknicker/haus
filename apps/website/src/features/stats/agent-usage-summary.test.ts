import { expect, test } from 'bun:test';
import type { TokenUsageOverview } from '@haus/api';
import { summarizeAgentTokenUsage } from './agent-usage-summary.ts';

function row(overrides: {
    agentId: string;
    date: string;
    totalTokens: number;
}): TokenUsageOverview['breakdown'][number] {
    return {
        agentAvatarUrl: null,
        agentHandle: 'scout',
        agentId: overrides.agentId,
        agentName: 'Scout',
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        date: overrides.date,
        inputTokens: overrides.totalTokens,
        modelId: 'claude-sonnet-5',
        outputTokens: 0,
        runtimeId: 'claude-code',
        totalTokens: overrides.totalTokens,
    };
}

const now = new Date('2026-08-14T09:00:00.000Z');

const usage: TokenUsageOverview = {
    breakdown: [
        row({ agentId: 'agt_scout', date: '2026-08-13', totalTokens: 100 }),
        // A second configuration on the same day adds to that day.
        row({ agentId: 'agt_scout', date: '2026-08-13', totalTokens: 20 }),
        row({ agentId: 'agt_scout', date: '2026-08-14', totalTokens: 5 }),
        // Another Agent's usage never reaches this Agent's tile.
        row({ agentId: 'agt_cove', date: '2026-08-14', totalTokens: 900 }),
        // Older than the window.
        row({ agentId: 'agt_scout', date: '2026-08-10', totalTokens: 700 }),
    ],
    days: 90,
    totals: {
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
    },
};

test('summarizes one Agent within the window, day by day', () => {
    const summary = summarizeAgentTokenUsage(usage, 'agt_scout', 3, now);

    expect(summary.totalTokens).toBe(125);
    expect(summary.points.map((point) => [point.date, point.tokens])).toEqual([
        ['2026-08-12', 0],
        ['2026-08-13', 120],
        ['2026-08-14', 5],
    ]);
});

test('keeps silent days so the sparkline reads as a timeline', () => {
    const summary = summarizeAgentTokenUsage(usage, 'agt_scout', 7, now);

    expect(summary.points).toHaveLength(7);
    expect(summary.days).toBe(7);
    expect(summary.points.at(-1)?.date).toBe('2026-08-14');
});

test('an Agent that has never run a turn summarizes to zero', () => {
    const summary = summarizeAgentTokenUsage(usage, 'agt_quiet', 30, now);

    expect(summary.totalTokens).toBe(0);
    expect(summary.points.every((point) => point.tokens === 0)).toBe(true);
});
