import { describe, expect, test } from 'bun:test';
import type { Agent, TokenUsageOverview } from '@haus/api';
import { summarizeAgentTokenUsage } from '../../stats/agent-usage-summary.ts';
import { formatTokens } from '../../stats/usage-format.ts';
import {
    type ActiveAgent,
    activeAgentHistoryDays,
    activeAgentWindowDays,
    agentSpike,
    agentSpikeLabel,
    agentWeekLabel,
    busiestWeek,
    rankActiveAgents,
    toActiveAgent,
    weekShare,
} from './active-agents.ts';

const asOf = new Date('2025-05-08T15:00:00.000Z');
const million = 1_000_000;

function agent(id: string, displayName: string): Agent {
    return {
        availability: 'idle',
        avatarUrl: null,
        displayName,
        id,
    } as Agent;
}

function entry(
    name: string,
    totalTokens: number,
    activityLabel: null | string = null,
    spike: ActiveAgent['spike'] = null
): ActiveAgent {
    return { activityLabel, agent: agent(name, name), days: [], spike, totalTokens };
}

function usage(
    rows: readonly { agentId: string; date: string; totalTokens: number }[]
): TokenUsageOverview {
    return {
        breakdown: rows.map((row) => ({
            agentAvatarUrl: null,
            agentHandle: row.agentId,
            agentId: row.agentId,
            agentName: row.agentId,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            date: row.date,
            inputTokens: row.totalTokens,
            modelId: 'model',
            outputTokens: 0,
            runtimeId: 'runtime',
            totalTokens: row.totalTokens,
        })),
        days: 90,
        totals: {
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
        },
    };
}

describe('toActiveAgent', () => {
    test('draws the seven days it counts, and reads the day before them for the spike', () => {
        const result = toActiveAgent(
            agent('agt_1', 'Blippy'),
            summarizeAgentTokenUsage(
                usage([
                    { agentId: 'agt_1', date: '2025-05-08', totalTokens: 1200 },
                    { agentId: 'agt_1', date: '2025-05-06', totalTokens: 800 },
                    // The eighth day back: history for the spike, not the week.
                    { agentId: 'agt_1', date: '2025-05-01', totalTokens: 400 },
                    // Another Agent's tokens, and one older than the history.
                    { agentId: 'agt_2', date: '2025-05-07', totalTokens: 500 },
                    { agentId: 'agt_1', date: '2025-01-01', totalTokens: 900 },
                ]),
                'agt_1',
                activeAgentHistoryDays,
                asOf
            ),
            null
        );

        expect(result.totalTokens).toBe(2000);
        expect(result.days).toEqual([0, 0, 0, 0, 800, 0, 1200]);
        expect(result.spike).toBeNull();
    });

    test('an Agent with nothing in the window reads as a quiet week', () => {
        const result = toActiveAgent(
            agent('agt_9', 'Quiet'),
            summarizeAgentTokenUsage(usage([]), 'agt_9', activeAgentHistoryDays, asOf),
            null
        );

        expect(result.totalTokens).toBe(0);
        expect(result.days).toHaveLength(activeAgentWindowDays);
        expect(result.spike).toBeNull();
    });
});

describe('agentSpike', () => {
    test('spikes at three times the prior week’s median day, past the floor', () => {
        const prior = [2, 1, 3, 2, 2, 1, 2].map((tokens) => tokens * million);
        const spike = agentSpike([...prior, 7 * million]);

        expect(spike).toEqual({ multiple: 3.5, todayTokens: 7 * million });
        expect(agentSpike([...prior, 5.9 * million])).toBeNull();
    });

    test('a big multiple under the token floor is not a runaway', () => {
        const prior = [100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 100_000];

        expect(agentSpike([...prior, 4.9 * million])).toBeNull();
    });

    test('no history in the prior week spikes past the floor, with no usual', () => {
        const prior = [0, 0, 0, 0, 0, 0, 0];

        expect(agentSpike([...prior, 6 * million])).toEqual({
            multiple: null,
            todayTokens: 6 * million,
        });
        expect(agentSpike([...prior, 4 * million])).toBeNull();
        expect(agentSpike([])).toBeNull();
    });

    test('a partial week measures from the first day the Agent ran', () => {
        // Three days old: its usual is 3M, not the median of four zeros and three 3Ms.
        const prior = [0, 0, 0, 0, 3, 3, 3].map((tokens) => tokens * million);

        expect(agentSpike([...prior, 6 * million])).toBeNull();
        expect(agentSpike([...prior, 9 * million])).toEqual({
            multiple: 3,
            todayTokens: 9 * million,
        });
        // A series shorter than the history window reads what it has.
        expect(agentSpike([2 * million, 6 * million])?.multiple).toBe(3);
    });

    test('quiet days after the first one still count toward the usual', () => {
        const prior = [4, 0, 0, 0, 0, 4, 0].map((tokens) => tokens * million);

        expect(agentSpike([...prior, 5 * million])).toEqual({
            multiple: null,
            todayTokens: 5 * million,
        });
    });
});

describe('agentSpikeLabel', () => {
    test('says how far past usual, to one place under ten', () => {
        expect(agentSpikeLabel({ multiple: 3.14, todayTokens: 0 })).toBe('3.1× usual');
        expect(agentSpikeLabel({ multiple: 42.6, todayTokens: 0 })).toBe('43× usual');
        expect(agentSpikeLabel({ multiple: null, todayTokens: 0 })).toBe('Unusual');
    });
});

describe('agentWeekLabel', () => {
    test('names the Agent with its week, and its spike when it has one', () => {
        const total = formatTokens(2 * million);
        expect(agentWeekLabel(entry('Scout', 2 * million))).toBe(
            `Scout, ${total} tokens this week`
        );
        const spike = { multiple: 3.14, todayTokens: million };
        expect(agentWeekLabel(entry('Scout', 2 * million, null, spike))).toBe(
            `Scout, ${total} tokens this week, 3.1× usual`
        );
    });
});

describe('rankActiveAgents', () => {
    test('drops the Agents with no week and nothing running', () => {
        expect(
            rankActiveAgents([entry('Quiet', 0), entry('Busy', 3000)]).map(
                (e) => e.agent.displayName
            )
        ).toEqual(['Busy']);
    });

    test('keeps a working Agent that has not billed a token yet', () => {
        expect(
            rankActiveAgents([entry('Working', 0, 'Editing files · 3m')]).map(
                (e) => e.agent.displayName
            )
        ).toEqual(['Working']);
    });

    test('spiking first, then working, then the busiest week, then the name', () => {
        expect(
            rankActiveAgents([
                entry('Cove', 9000),
                entry('Tiny', 2000, 'Reading files · 1m'),
                entry('Amber', 4000),
                entry('Zephyr', 4000),
                entry('Runaway', 1000, null, { multiple: 4, todayTokens: 6 * million }),
            ]).map((e) => e.agent.displayName)
        ).toEqual(['Runaway', 'Tiny', 'Cove', 'Amber', 'Zephyr']);
    });

    test('keeps every active Agent; the strip folds, the list does not', () => {
        const many = Array.from({ length: 20 }, (_, index) =>
            entry(`Agent ${index}`, (index + 1) * 100)
        );
        expect(rankActiveAgents(many)).toHaveLength(20);
    });
});

describe('weekShare', () => {
    test('measures each week against the busiest one', () => {
        const entries = [entry('Busy', 8000), entry('Half', 4000), entry('Quiet', 0)];
        const busiest = busiestWeek(entries);

        expect(entries.map((e) => weekShare(e, busiest))).toEqual([100, 50, 0]);
        expect(weekShare(entry('Nobody', 0), busiestWeek([]))).toBe(0);
    });
});
