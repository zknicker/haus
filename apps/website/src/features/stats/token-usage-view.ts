import type { TokenUsageOverview } from '@haus/api';
import {
    agentSeriesColorMap,
    agentSeriesColors,
    otherSeriesColor,
    runtimeUsageLabel,
} from './token-usage-colors.ts';

export type TokenUsageRange = 7 | 30 | 90;

const tokenFields = [
    'cacheReadTokens',
    'cacheWriteTokens',
    'inputTokens',
    'outputTokens',
    'totalTokens',
] as const;
const otherSeriesId = 'other';

export type TokenTotals = TokenUsageOverview['totals'];

export interface TokenUsageAgentIdentity {
    agentAvatarUrl: null | string;
    agentHandle: string;
    agentId: string;
    agentName: string;
}

export interface AgentUsage extends TokenTotals, TokenUsageAgentIdentity {}

export interface ConfigurationUsage extends TokenTotals, TokenUsageAgentIdentity {
    id: string;
    modelId: string;
    runtimeId: string;
    runtimeLabel: string;
}

/** One stacked chart series: a single Agent, or every Agent past the color slots. */
export type ChartSeries = TokenTotals & {
    color: string;
    id: string;
    label: string;
} & ({ agentId: string; isOther: false } | { agentCount: number; isOther: true });

export interface TokenUsageView {
    agents: AgentUsage[];
    chartData: Record<string, number | string>[];
    chartSeries: ChartSeries[];
    configurations: ConfigurationUsage[];
    selectedAgent: AgentUsage | null;
    totals: TokenTotals;
}

export interface TokenUsageScope {
    agentIds?: string[];
    /**
     * Agents known to the Server regardless of whether they billed tokens. Usage
     * rows alone cannot describe a roster, so a quiet Agent would otherwise
     * vanish from the per-Agent filters instead of reading as zero.
     */
    knownAgents?: TokenUsageAgentIdentity[];
    runtimeId?: string;
}

export function buildTokenUsageView(
    usage: TokenUsageOverview,
    days: TokenUsageRange,
    selectedAgentId: null | string = null,
    now: Date = new Date(),
    scope: TokenUsageScope = {}
): TokenUsageView {
    const rangeDates = usageDatesThroughToday(days, now);
    const startDate = rangeDates[0] ?? '';
    const endDate = rangeDates.at(-1) ?? '';
    const agentIds = scope.agentIds ? new Set(scope.agentIds) : null;
    const rangeBreakdown = usage.breakdown.filter(
        (item) =>
            item.date >= startDate &&
            item.date <= endDate &&
            (!agentIds || agentIds.has(item.agentId)) &&
            (!scope.runtimeId || item.runtimeId === scope.runtimeId)
    );
    const agents = buildAgents(
        rangeBreakdown,
        (scope.knownAgents ?? []).filter((agent) => !agentIds || agentIds.has(agent.agentId))
    );
    const selectedAgent = agents.find((agent) => agent.agentId === selectedAgentId) ?? null;
    const effectiveAgentId = selectedAgent?.agentId ?? null;
    // Volume picks which Agents are named; the roster picks their colors (see
    // agentSeriesColorMap). Naming ignores the selection, so narrowing to one
    // Agent keeps the color it had in the full view.
    const roster = colorRoster(usage.breakdown, scope.knownAgents ?? []);
    const namedColors = agentSeriesColorMap(
        roster,
        agents
            .filter((agent) => agent.totalTokens > 0)
            .slice(0, agentSeriesColors.length)
            .map((agent) => agent.agentId)
    );
    const colorFor = (agentId: string): string =>
        namedColors.get(agentId) ??
        (agentId === effectiveAgentId
            ? (agentSeriesColorMap(roster, [agentId]).get(agentId) ?? otherSeriesColor)
            : otherSeriesColor);
    const scopedBreakdown = effectiveAgentId
        ? rangeBreakdown.filter((item) => item.agentId === effectiveAgentId)
        : rangeBreakdown;
    const totals = emptyTotals();
    for (const item of scopedBreakdown) {
        addTotals(totals, item);
    }
    const chartSeries = buildChartSeries(
        agents.filter((agent) =>
            effectiveAgentId ? agent.agentId === effectiveAgentId : agent.totalTokens > 0
        ),
        colorFor
    );
    const seriesIdByAgent = new Map<string, string>();
    for (const series of chartSeries) {
        if (!series.isOther) {
            seriesIdByAgent.set(series.agentId, series.id);
        }
    }

    const chartLookup = new Map<string, number>();
    for (const item of scopedBreakdown) {
        const key = `${item.date}\u0000${seriesIdByAgent.get(item.agentId) ?? otherSeriesId}`;
        chartLookup.set(key, (chartLookup.get(key) ?? 0) + item.totalTokens);
    }
    const chartData = rangeDates.map((date) => {
        const point: Record<string, number | string> = { date, label: formatUsageDay(date) };
        for (const series of chartSeries) {
            point[series.id] = chartLookup.get(`${date}\u0000${series.id}`) ?? 0;
        }
        return point;
    });

    return {
        agents,
        chartData,
        chartSeries,
        configurations: buildConfigurations(scopedBreakdown),
        selectedAgent,
        totals,
    };
}

function buildAgents(
    breakdown: TokenUsageOverview['breakdown'],
    knownAgents: TokenUsageAgentIdentity[]
): AgentUsage[] {
    const agents = new Map<string, AgentUsage>();
    for (const known of knownAgents) {
        agents.set(known.agentId, { ...identityOf(known), ...emptyTotals() });
    }
    for (const item of breakdown) {
        const agent = agents.get(item.agentId) ?? { ...identityOf(item), ...emptyTotals() };
        addTotals(agent, item);
        agents.set(item.agentId, agent);
    }
    return [...agents.values()].sort(
        (a, b) => b.totalTokens - a.totalTokens || a.agentName.localeCompare(b.agentName)
    );
}

function buildChartSeries(
    rankedAgents: AgentUsage[],
    colorFor: (agentId: string) => string
): ChartSeries[] {
    const named = rankedAgents.filter((agent) => colorFor(agent.agentId) !== otherSeriesColor);
    const series: ChartSeries[] = named.map((agent) => ({
        ...totalsOf(agent),
        agentId: agent.agentId,
        color: colorFor(agent.agentId),
        id: `agent:${agent.agentId}`,
        isOther: false,
        label: agent.agentName,
    }));
    const rest = rankedAgents.slice(named.length);
    if (rest.length === 0) {
        return series;
    }
    const other: ChartSeries = {
        ...emptyTotals(),
        agentCount: rest.length,
        color: otherSeriesColor,
        id: otherSeriesId,
        isOther: true,
        label: 'Other',
    };
    for (const agent of rest) {
        addTotals(other, agent);
    }
    return [...series, other];
}

function buildConfigurations(breakdown: TokenUsageOverview['breakdown']): ConfigurationUsage[] {
    const configurations = new Map<string, ConfigurationUsage>();
    for (const item of breakdown) {
        const id = `${item.agentId}:${item.runtimeId}:${item.modelId}`;
        const configuration = configurations.get(id) ?? {
            ...identityOf(item),
            id,
            modelId: item.modelId,
            runtimeId: item.runtimeId,
            runtimeLabel: runtimeUsageLabel(item.runtimeId),
            ...emptyTotals(),
        };
        addTotals(configuration, item);
        configurations.set(id, configuration);
    }
    return [...configurations.values()].sort((a, b) => b.totalTokens - a.totalTokens);
}

/**
 * The stable color key: the Server's Agent list (oldest first), then Agents seen
 * only in usage rows, by id. It reads the whole overview, not the range or
 * scope, so neither can reorder it.
 */
function colorRoster(
    breakdown: TokenUsageOverview['breakdown'],
    knownAgents: TokenUsageAgentIdentity[]
): string[] {
    const known = new Set(knownAgents.map((agent) => agent.agentId));
    const unlisted = [...new Set(breakdown.map((item) => item.agentId))]
        .filter((agentId) => !known.has(agentId))
        .sort();
    return [...known, ...unlisted];
}

/** The inclusive UTC day range a usage window covers, oldest first. */
export function usageDatesThroughToday(days: number, now: Date) {
    const end = new Date(now);
    end.setUTCHours(0, 0, 0, 0);
    return Array.from({ length: days }, (_, index) => {
        const date = new Date(end);
        date.setUTCDate(end.getUTCDate() - (days - index - 1));
        return date.toISOString().slice(0, 10);
    });
}

/** One axis label for a UTC usage day. */
export function formatUsageDay(date: string) {
    return new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00.000Z`));
}

function identityOf(source: TokenUsageAgentIdentity): TokenUsageAgentIdentity {
    return {
        agentAvatarUrl: source.agentAvatarUrl,
        agentHandle: source.agentHandle,
        agentId: source.agentId,
        agentName: source.agentName,
    };
}

function emptyTotals(): TokenTotals {
    return {
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
    };
}

function totalsOf(source: TokenTotals): TokenTotals {
    const totals = emptyTotals();
    addTotals(totals, source);
    return totals;
}

function addTotals(target: TokenTotals, source: TokenTotals) {
    for (const field of tokenFields) {
        target[field] += source[field];
    }
}
