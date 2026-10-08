import type { AgentExecutionOutline, AgentExecutionOutlineStep } from '@haus/api';
import type { TraceBarKind } from '../../turn-trace/turn-trace-grid.tsx';
import { traceStepKind, traceToolKind } from '../../turn-trace/turn-trace-kind.ts';
import type { TurnTraceStep } from '../../turn-trace/turn-trace-step-types.ts';
import type { TurnTraceStatus } from '../../turn-trace/turn-trace-tool-model.ts';
import type { TimelineStatus } from './agent-activity-log-overview-model.ts';
import type { StepMark } from './agent-activity-log-stores.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import { formatDayLabel, localDayKey, type TurnRowTitle } from './agent-turn-row-model.ts';
import { collapseRecentActivity, type RecentActivityRow } from './recent-activity-rows.ts';
import { useAgentsTurnRowTitles } from './use-turn-row-titles.ts';

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

/** Every local day from today through the oldest loaded turn, including quiet days. */
export function readLogDays(
    entries: readonly ActivityLogEntry[],
    filter: ActivityLogFilter,
    now = Date.now()
): ActivityLogDay[] {
    const shown = entries
        .filter((entry) => filter.agentIds.includes(entry.agent.id))
        .sort(
            (left, right) =>
                Date.parse(right.row.latest.startedAt) - Date.parse(left.row.latest.startedAt)
        );
    const byDay = new Map<string, ActivityLogEntry[]>();
    for (const entry of shown) {
        const key = localDayKey(new Date(entry.row.latest.startedAt));
        const dayEntries = byDay.get(key) ?? [];
        dayEntries.push(entry);
        byDay.set(key, dayEntries);
    }
    const oldest = shown.at(-1);
    const end = new Date(oldest ? oldest.row.latest.startedAt : now);
    end.setHours(0, 0, 0, 0);
    const newest = shown[0];
    const cursor = new Date(newest ? Math.max(now, Date.parse(newest.row.latest.startedAt)) : now);
    cursor.setHours(0, 0, 0, 0);
    const days: ActivityLogDay[] = [];
    while (cursor >= end) {
        const key = localDayKey(cursor);
        days.push({ entries: byDay.get(key) ?? [], key, label: formatDayLabel(cursor, now) });
        cursor.setDate(cursor.getDate() - 1);
    }
    return days;
}

/** The newest populated day's latest turns open on arrival. */
const openOnArrival = 10;

export function readOpenOnArrival(days: readonly ActivityLogDay[]): ReadonlySet<string> {
    return new Set(
        (days.find((day) => day.entries.length > 0)?.entries ?? [])
            .slice(0, openOnArrival)
            .map((entry) => entry.row.latest.runId)
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
        const kind = traceStepKind(step);
        if (!kind) {
            return [];
        }
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

/**
 * An unread turn's top-level steps from its Computer outline, toned as
 * {@link readStepMarks} tones a read trace: bookkeeping Haus, reasoning
 * thinking, a sub-agent its own hue (a warning when its calls failed), and a
 * call by the kind the Computer classified it with, the trace's own classifier.
 */
export function readOutlineMarks(outline: AgentExecutionOutline, turnMs: number): StepMark[] {
    const axisMs = Math.max(outline.durationMs, turnMs);
    if (axisMs <= 0) {
        return [];
    }
    return outline.steps
        .filter((step) => step.depth === 0)
        .map((step) => ({
            kind: readOutlineKind(step),
            start: Math.min(1, step.startOffsetMs / axisMs),
            status: readOutlineStatus(step),
            width: Math.min(1, (step.durationMs ?? 0) / axisMs),
        }));
}

function readOutlineKind(step: AgentExecutionOutlineStep): TraceBarKind {
    switch (step.kind) {
        case 'bookkeeping':
            return 'haus';
        case 'reasoning':
            return 'thinking';
        case 'subagent':
            return 'subagent';
        case 'tool':
            return step.toolKind ? traceToolKind(step.toolKind) : 'tool';
    }
}

function readOutlineStatus(step: AgentExecutionOutlineStep): TurnTraceStatus {
    return step.status === 'completed' && (step.subagent?.failedToolCount ?? 0) > 0
        ? 'warning'
        : step.status;
}

/** One Agent's turns, as the log reads them. */
export interface ActivityLogAgentTurns {
    readonly agent: ActivityLogAgent;
    readonly turns: readonly AgentActivityTurn[];
}

/**
 * Turns from any number of Agents as log entries, titled from their requests.
 * Failures fold within one Agent only: two Agents failing alike are two facts.
 */
export function useLogEntries(
    serverId: string,
    groups: readonly ActivityLogAgentTurns[]
): ActivityLogEntry[] {
    const rows = groups.flatMap(({ agent, turns }) =>
        collapseRecentActivity(turns, Number.POSITIVE_INFINITY).map((row) => ({ agent, row }))
    );
    const titleOf = useAgentsTurnRowTitles(
        serverId,
        rows.map(({ agent, row }) => ({ agentId: agent.id, turn: row.latest }))
    );
    return rows.map(({ agent, row }) => ({ agent, row, title: titleOf(row.latest) }));
}
