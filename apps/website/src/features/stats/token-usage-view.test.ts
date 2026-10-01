import type { TokenUsageOverview } from '@haus/api';
import { expect, test } from 'vitest';
import { agentSeriesColorMap } from './token-usage-colors.ts';
import { buildTokenUsageView } from './token-usage-view.ts';

const zero = {
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
};

const usage: TokenUsageOverview = {
    breakdown: [
        {
            agentAvatarUrl: '/api/avatars/cove',
            agentHandle: 'cove',
            agentId: 'agt_cove',
            agentName: 'Cove',
            cacheReadTokens: 60,
            cacheWriteTokens: 5,
            date: '2026-08-12',
            inputTokens: 80,
            modelId: 'gpt-5.6-sol',
            outputTokens: 20,
            runtimeId: 'codex',
            totalTokens: 100,
        },
        {
            agentAvatarUrl: null,
            agentHandle: 'scout',
            agentId: 'agt_scout',
            agentName: 'Scout',
            cacheReadTokens: 20,
            cacheWriteTokens: 4,
            date: '2026-08-13',
            inputTokens: 30,
            modelId: 'claude-sonnet-5',
            outputTokens: 10,
            runtimeId: 'claude-code',
            totalTokens: 40,
        },
        {
            agentAvatarUrl: '/api/avatars/cove',
            agentHandle: 'cove',
            agentId: 'agt_cove',
            agentName: 'Cove',
            date: '2026-07-01',
            inputTokens: 900,
            modelId: 'gpt-5.6-sol',
            outputTokens: 100,
            runtimeId: 'codex',
            totalTokens: 1000,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
        },
        {
            agentAvatarUrl: null,
            agentHandle: 'future',
            agentId: 'agt_future',
            agentName: 'Future',
            date: '2026-08-14',
            inputTokens: 900,
            modelId: 'gpt-future',
            outputTokens: 100,
            runtimeId: 'codex',
            totalTokens: 1000,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
        },
    ],
    days: 90,
    totals: zero,
};

test('builds a range-scoped token view by runtime, model, and Haus agent', () => {
    const view = buildTokenUsageView(usage, 7, null, new Date('2026-08-13T18:00:00.000Z'));

    expect(view.totals).toEqual({
        cacheReadTokens: 80,
        cacheWriteTokens: 9,
        inputTokens: 110,
        outputTokens: 30,
        totalTokens: 140,
    });
    expect(view.agents.map((agent) => [agent.agentName, agent.totalTokens])).toEqual([
        ['Cove', 100],
        ['Scout', 40],
    ]);
    expect(view.configurations.map((model) => [model.modelId, model.totalTokens])).toEqual([
        ['gpt-5.6-sol', 100],
        ['claude-sonnet-5', 40],
    ]);
    expect(view.chartData).toHaveLength(7);
    expect(view.chartSeries.map((series) => series.label)).toEqual(['Cove', 'Scout']);
    expect(view.chartData.at(-1)).toMatchObject({ 'agent:agt_cove': 0, 'agent:agt_scout': 40 });
});

test('scopes totals and configurations to one agent without losing the agent picker', () => {
    const view = buildTokenUsageView(usage, 7, 'agt_cove', new Date('2026-08-13T18:00:00.000Z'));

    expect(view.selectedAgent?.agentName).toBe('Cove');
    expect(view.totals.totalTokens).toBe(100);
    expect(view.configurations.map((item) => item.id)).toEqual(['agt_cove:codex:gpt-5.6-sol']);
    expect(view.agents).toHaveLength(2);
});

test('scopes usage by immutable Computer assignment and runtime', () => {
    const view = buildTokenUsageView(usage, 7, null, new Date('2026-08-13T18:00:00.000Z'), {
        agentIds: ['agt_scout'],
        runtimeId: 'claude-code',
    });

    expect(view.totals.totalTokens).toBe(40);
    expect(view.agents.map((agent) => agent.agentName)).toEqual(['Scout']);
    expect(view.configurations.map((item) => item.runtimeId)).toEqual(['claude-code']);
});

test('keeps quiet Agents in the picker at zero instead of dropping them', () => {
    const view = buildTokenUsageView(
        { breakdown: [], days: 90, totals: zero },
        7,
        null,
        new Date('2026-08-13T18:00:00.000Z'),
        {
            knownAgents: [
                {
                    agentAvatarUrl: null,
                    agentHandle: 'tiny',
                    agentId: 'agt_tiny',
                    agentName: 'Tiny',
                },
                {
                    agentAvatarUrl: null,
                    agentHandle: 'blippy',
                    agentId: 'agt_blippy',
                    agentName: 'Blippy',
                },
            ],
        }
    );

    expect(view.agents.map((agent) => agent.agentName)).toEqual(['Blippy', 'Tiny']);
    expect(view.agents.every((agent) => agent.totalTokens === 0)).toBe(true);
});

test('counts a known Agent usage exactly once', () => {
    const view = buildTokenUsageView(usage, 7, null, new Date('2026-08-13T18:00:00.000Z'), {
        knownAgents: [
            {
                agentAvatarUrl: '/api/avatars/cove',
                agentHandle: 'cove',
                agentId: 'agt_cove',
                agentName: 'Cove',
            },
        ],
    });

    expect(view.agents.find((agent) => agent.agentId === 'agt_cove')?.totalTokens).toBe(100);
    expect(view.agents.filter((agent) => agent.agentId === 'agt_cove')).toHaveLength(1);
});

test('leaves out known Agents excluded by the Computer scope', () => {
    const view = buildTokenUsageView(usage, 7, null, new Date('2026-08-13T18:00:00.000Z'), {
        agentIds: ['agt_scout'],
        knownAgents: [
            {
                agentAvatarUrl: null,
                agentHandle: 'cove',
                agentId: 'agt_cove',
                agentName: 'Cove',
            },
        ],
    });

    expect(view.agents.map((agent) => agent.agentId)).toEqual(['agt_scout']);
});

const roster = ['cove', 'scout', 'future'].map((handle) => ({
    agentAvatarUrl: null,
    agentHandle: handle,
    agentId: `agt_${handle}`,
    agentName: handle[0]?.toUpperCase() + handle.slice(1),
}));

test('keeps an Agent color when a different range reverses the ranking', () => {
    // Cove leads the 90-day range on its July spike; Future leads the last 7 days.
    const now = new Date('2026-08-14T18:00:00.000Z');
    const colorsOf = (view: ReturnType<typeof buildTokenUsageView>) =>
        Object.fromEntries(view.chartSeries.map((series) => [series.label, series.color]));
    const week = buildTokenUsageView(usage, 7, null, now, { knownAgents: roster });
    const quarter = buildTokenUsageView(usage, 90, null, now, { knownAgents: roster });

    expect(week.chartSeries.map((series) => series.label)).toEqual(['Future', 'Cove', 'Scout']);
    expect(quarter.chartSeries.map((series) => series.label)).toEqual(['Cove', 'Future', 'Scout']);
    expect(colorsOf(week)).toEqual(colorsOf(quarter));
    expect(colorsOf(week)).toEqual({
        Cove: 'var(--chart-1)',
        Future: 'var(--chart-3)',
        Scout: 'var(--chart-2)',
    });
});

test('stacks one series per Agent with a distinct categorical color', () => {
    const twoModels: TokenUsageOverview = {
        ...usage,
        breakdown: [
            ...usage.breakdown,
            { ...usage.breakdown[0]!, modelId: 'gpt-5.6-mini', runtimeId: 'pi', totalTokens: 7 },
        ],
    };
    const view = buildTokenUsageView(twoModels, 7, null, new Date('2026-08-13T18:00:00.000Z'), {
        knownAgents: roster,
    });

    expect(view.chartSeries.map((series) => [series.label, series.totalTokens])).toEqual([
        ['Cove', 107],
        ['Scout', 40],
    ]);
    expect(view.chartSeries.map((series) => series.color)).toEqual([
        'var(--chart-1)',
        'var(--chart-2)',
    ]);
});

test('keeps an Agent color when the view narrows to that Agent', () => {
    const view = buildTokenUsageView(usage, 7, 'agt_scout', new Date('2026-08-13T18:00:00.000Z'), {
        knownAgents: roster,
    });

    expect(view.chartSeries).toHaveLength(1);
    expect(view.chartSeries[0]).toMatchObject({ color: 'var(--chart-2)', label: 'Scout' });
});

test('folds Agents past the color slots into a reconciled neutral Other series', () => {
    const crowded: TokenUsageOverview = {
        ...usage,
        breakdown: Array.from({ length: 6 }, (_, index) => ({
            agentAvatarUrl: null,
            agentHandle: `agent-${index}`,
            agentId: `agt_${index}`,
            agentName: `Agent ${index}`,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            date: '2026-08-13',
            inputTokens: index + 1,
            modelId: 'gpt-5.6-sol',
            outputTokens: 0,
            runtimeId: 'codex',
            totalTokens: index + 1,
        })),
    };

    const view = buildTokenUsageView(crowded, 7, null, new Date('2026-08-13T18:00:00.000Z'));
    const lastPoint = view.chartData.at(-1) ?? {};
    const plottedTotal = view.chartSeries.reduce(
        (sum, series) => sum + Number(lastPoint[series.id] ?? 0),
        0
    );
    const other = view.chartSeries.at(-1);

    expect(view.chartSeries.map((series) => series.label)).toEqual([
        'Agent 5',
        'Agent 4',
        'Agent 3',
        'Agent 2',
        'Other',
    ]);
    expect(new Set(view.chartSeries.map((series) => series.color)).size).toBe(5);
    expect(other).toMatchObject({ agentCount: 2, color: 'var(--chart-5)', isOther: true });
    expect(plottedTotal).toBe(view.totals.totalTokens);
});

test('gives named Agents past the roster slots the free colors, never a repeat', () => {
    expect(
        Object.fromEntries(
            agentSeriesColorMap(['a', 'b', 'c', 'd', 'e', 'f'], ['f', 'b', 'e', 'd'])
        )
    ).toEqual({
        b: 'var(--chart-2)',
        d: 'var(--chart-4)',
        e: 'var(--chart-1)',
        f: 'var(--chart-3)',
    });
});
