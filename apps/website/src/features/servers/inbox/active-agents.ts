import type { Agent } from '@haus/api';
import type { AgentUsageSummary } from '../../stats/agent-usage-summary.ts';
import { formatTokens } from '../../stats/usage-format.ts';

/**
 * One Agent's week as the Inbox's Agents meter reads it: the shape of its last
 * seven days of processed tokens, how many it burned in them, whether today ran
 * far past its own usual, and whether it is running now.
 */
export interface ActiveAgent {
    /** The step it is on right now, or null when it is between turns. */
    activityLabel: null | string;
    agent: Agent;
    /** Processed tokens per UTC usage day, oldest first — the sparkline's series. */
    days: number[];
    /** Today against the Agent's own usual, or null when today is ordinary. */
    spike: AgentSpike | null;
    totalTokens: number;
}

/** A day that ran far past an Agent's own usual. */
export interface AgentSpike {
    /**
     * Today over the median day of the week before it, or null when the Agent
     * had no usual to measure against — no usage at all in that week.
     */
    multiple: null | number;
    todayTokens: number;
}

/** How much history the meter shows, in whole UTC usage days. */
export const activeAgentWindowDays = 7;

/**
 * How much history the usage read is sliced to: today plus the seven days a
 * spike is measured against. One day more than the meter shows.
 */
export const activeAgentHistoryDays = activeAgentWindowDays + 1;

/** Today must run at least this many times the Agent's usual day to spike. */
export const spikeMultiple = 3;

/**
 * And burn at least this many tokens. A quiet Agent tripling a quiet day is
 * not a runaway; the floor is what keeps the meter from crying wolf.
 */
export const spikeFloorTokens = 5_000_000;

/** How many Agents the narrow strip shows before folding the rest into "+N". */
export const stripAgentLimit = 5;

/**
 * One Agent's numbers, from the Server's own usage snapshot sliced to
 * `activeAgentHistoryDays`. The meter shows the last seven of those days; the
 * spike reads all of them.
 *
 * Tokens rather than turns: a turn is a unit of the execution runtime's
 * bookkeeping, and ten cheap turns and one long one read the same in a count.
 */
export function toActiveAgent(
    agent: Agent,
    usage: AgentUsageSummary,
    activityLabel: null | string
): ActiveAgent {
    const series = usage.points.map((point) => point.tokens);
    const days = series.slice(-activeAgentWindowDays);
    return {
        activityLabel,
        agent,
        days,
        spike: agentSpike(series),
        totalTokens: days.reduce((total, tokens) => total + tokens, 0),
    };
}

/**
 * Whether today ran away: at least `spikeMultiple` times the median of the
 * prior seven days, and at least `spikeFloorTokens`. Days are UTC usage days,
 * oldest first, with today last.
 *
 * Days before the Agent's first usage in that week are not part of its usual —
 * an Agent three days old has a three-day usual, not a week padded with four
 * zeros that would make any busy day look like a spike. A quiet day after that
 * does count, because it is a real day the Agent had and did not use.
 */
export function agentSpike(series: readonly number[]): AgentSpike | null {
    const todayTokens = series.at(-1) ?? 0;
    if (todayTokens < spikeFloorTokens) {
        return null;
    }
    const prior = series.slice(-activeAgentHistoryDays, -1);
    const firstUsed = prior.findIndex((tokens) => tokens > 0);
    if (firstUsed === -1) {
        return { multiple: null, todayTokens };
    }
    const usual = median(prior.slice(firstUsed));
    if (usual > 0 && todayTokens < usual * spikeMultiple) {
        return null;
    }
    return { multiple: usual > 0 ? todayTokens / usual : null, todayTokens };
}

/** The spike as its chip says it: "3.1× usual", or "Unusual" with no usual. */
export function agentSpikeLabel(spike: AgentSpike): string {
    if (spike.multiple === null) {
        return 'Unusual';
    }
    const multiple =
        spike.multiple >= 10 ? Math.round(spike.multiple).toString() : spike.multiple.toFixed(1);
    return `${multiple}× usual`;
}

/**
 * An Agent's week as one accessible name — "Scout, 1.2M tokens this week" —
 * shared by its rail row and its strip chip, so the one Agent announces the
 * same way in either arrangement and never as its bare name, which a
 * Happening now row beside it may also start with.
 */
export function agentWeekLabel(entry: Pick<ActiveAgent, 'agent' | 'spike' | 'totalTokens'>) {
    const week = `${entry.agent.displayName}, ${formatTokens(entry.totalTokens)} tokens this week`;
    return entry.spike === null ? week : `${week}, ${agentSpikeLabel(entry.spike)}`;
}

/**
 * The Agents worth a row: the ones that did something this week, or are doing
 * something right now. A spiking Agent leads — it is the reason the meter
 * exists, and the narrow strip must never fold it behind "+N" — then working
 * Agents, then the busiest week, then the name, so the order is stable when two
 * Agents burned the same amount.
 *
 * An Agent that ran nothing and is running nothing has no week to show, so it
 * is not a quiet row; it is simply not in the list.
 */
export function rankActiveAgents(entries: readonly ActiveAgent[]): ActiveAgent[] {
    return entries
        .filter((entry) => entry.totalTokens > 0 || entry.activityLabel !== null)
        .sort(
            (a, b) =>
                flag(b.spike) - flag(a.spike) ||
                flag(b.activityLabel) - flag(a.activityLabel) ||
                b.totalTokens - a.totalTokens ||
                a.agent.displayName.localeCompare(b.agent.displayName)
        );
}

/** The busiest week in the list: what every row's bar is measured against. */
export function busiestWeek(entries: readonly ActiveAgent[]): number {
    return Math.max(0, ...entries.map((entry) => entry.totalTokens));
}

/**
 * An Agent's week as a share of the busiest week, 0–100, which is what each
 * row's bar draws. The busiest Agent fills its bar.
 */
export function weekShare(entry: Pick<ActiveAgent, 'totalTokens'>, busiest: number): number {
    return busiest > 0 ? (entry.totalTokens / busiest) * 100 : 0;
}

function flag(value: unknown): number {
    return value === null ? 0 : 1;
}

function median(values: readonly number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length === 0) {
        return 0;
    }
    return sorted.length % 2 === 0
        ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
        : (sorted[middle] ?? 0);
}
