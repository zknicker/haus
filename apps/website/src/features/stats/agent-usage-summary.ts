import type { TokenUsageOverview } from '@haus/api';
import { formatUsageDay, usageDatesThroughToday } from './token-usage-view.ts';

export interface AgentUsageDay {
    date: string;
    label: string;
    tokens: number;
}

export interface AgentUsageSummary {
    /** How many days the window covers; the profile tile is fixed at 30. */
    days: number;
    points: AgentUsageDay[];
    totalTokens: number;
}

/**
 * One Agent's processed-token volume as a headline number and a daily series —
 * what a profile tile needs, and nothing the full Usage dashboard exists for.
 * Every day in the window is present, including the silent ones, so the
 * sparkline reads as a timeline rather than as a list of busy days.
 */
export function summarizeAgentTokenUsage(
    usage: TokenUsageOverview,
    agentId: string,
    days = 30,
    now: Date = new Date()
): AgentUsageSummary {
    const dates = usageDatesThroughToday(days, now);
    const start = dates[0] ?? '';
    const end = dates.at(-1) ?? '';
    const tokensByDate = new Map<string, number>();
    let totalTokens = 0;

    for (const item of usage.breakdown) {
        if (item.agentId !== agentId || item.date < start || item.date > end) {
            continue;
        }
        tokensByDate.set(item.date, (tokensByDate.get(item.date) ?? 0) + item.totalTokens);
        totalTokens += item.totalTokens;
    }

    return {
        days,
        points: dates.map((date) => ({
            date,
            label: formatUsageDay(date),
            tokens: tokensByDate.get(date) ?? 0,
        })),
        totalTokens,
    };
}

/**
 * The daily series as a sparkline takes it. `KPI.Chart` accepts
 * `Record<string, number | string>[]`, which a named interface cannot satisfy,
 * so the series is projected to the two fields the chart actually reads.
 */
export function agentUsageSparkline(summary: AgentUsageSummary) {
    return summary.points.map((point) => ({ label: point.label, tokens: point.tokens }));
}
