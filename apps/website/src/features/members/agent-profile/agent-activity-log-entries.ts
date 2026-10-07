import type { TurnTraceStep } from '../../turn-trace/turn-trace-step-types.ts';
import type { TimelineStatus } from './agent-activity-log-overview-model.ts';
import type { StepMark } from './agent-activity-log-stores.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import { groupTurnRowsByDay, type TurnRowTitle } from './agent-turn-row-model.ts';
import { collapseRecentActivity, type RecentActivityRow } from './recent-activity-rows.ts';
import { useTurnRowTitles } from './use-turn-row-titles.ts';

/**
 * What the log renders: turns from any number of
 * Agents, each carrying who did it and what it was asked. The log itself never
 * reads per-Agent data, so an all-Agents view is the same log with a wider
 * filter.
 */
export interface ActivityLogAgent {
    readonly avatarUrl: string | null;
    readonly displayName: string;
    readonly id: string;
}

export interface ActivityLogEntry {
    readonly agent: ActivityLogAgent;
    readonly row: RecentActivityRow;
    readonly title: TurnRowTitle;
}

/** Which Agents the log shows; more than one names the Agent on each turn. */
export interface ActivityLogFilter {
    readonly agentIds: readonly string[];
}

export interface ActivityLogDay {
    readonly entries: readonly ActivityLogEntry[];
    readonly key: string;
    readonly label: string;
}

/** Entries newest first under `Today`, `Yesterday`, `Oct 4`, after the filter. */
export function readLogDays(
    entries: readonly ActivityLogEntry[],
    filter: ActivityLogFilter
): ActivityLogDay[] {
    const shown = entries
        .filter((entry) => filter.agentIds.includes(entry.agent.id))
        .sort(
            (left, right) =>
                Date.parse(right.row.latest.startedAt) - Date.parse(left.row.latest.startedAt)
        );
    const byRow = new Map(shown.map((entry) => [entry.row, entry]));
    return groupTurnRowsByDay(shown.map((entry) => entry.row)).map((day) => ({
        entries: day.rows.map((row) => byRow.get(row) as ActivityLogEntry),
        key: day.key,
        label: day.label,
    }));
}

/** The newest day's latest turns open on arrival; everything older waits for a click. */
const openOnArrival = 10;

export function readOpenOnArrival(days: readonly ActivityLogDay[]): ReadonlySet<string> {
    return new Set(
        (days[0]?.entries ?? []).slice(0, openOnArrival).map((entry) => entry.row.latest.runId)
    );
}

export function timelineStatus(turn: AgentActivityTurn): TimelineStatus {
    return turn.kind === 'active' ? 'working' : turn.status;
}

/**
 * A turn's top-level steps as fractions of its axis, toned exactly as their
 * rows' bars: the overview's and a collapsed header's inner rhythm.
 */
export function readStepMarks(steps: readonly TurnTraceStep[], axisMs: number): StepMark[] {
    if (axisMs <= 0) {
        return [];
    }
    return steps.flatMap((step): StepMark[] => {
        if (step.kind === 'event') {
            return [];
        }
        const status = 'status' in step ? step.status : 'completed';
        const kind =
            step.kind === 'haus' ||
            (step.kind === 'call' &&
                step.tool.isBookkeeping &&
                (status === 'completed' || status === 'running'))
                ? 'quiet'
                : step.kind === 'call' || step.kind === 'fold'
                  ? 'tool'
                  : 'step';
        return [
            {
                kind,
                start: Math.min(1, step.timing.offsetMs / axisMs),
                status,
                width: Math.min(1, (step.timing.durationMs ?? 0) / axisMs),
            },
        ];
    });
}

/** One Agent's turns as log entries, titled from their requests. */
export function useAgentLogEntries(
    serverId: string,
    agent: ActivityLogAgent,
    turns: readonly AgentActivityTurn[]
): ActivityLogEntry[] {
    const rows = collapseRecentActivity(turns, Number.POSITIVE_INFINITY);
    const titleOf = useTurnRowTitles(
        serverId,
        agent.id,
        rows.map((row) => row.latest)
    );
    return rows.map((row) => ({ agent, row, title: titleOf(row.latest) }));
}
