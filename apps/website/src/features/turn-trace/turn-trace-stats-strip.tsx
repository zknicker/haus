import type { AgentExecutionJournal } from '@haus/api';
import type * as React from 'react';
import type { AgentActivityTurn } from '../members/agent-profile/agent-activity-turns.ts';
import { formatTurnOutcome } from '../members/agent-profile/agent-turn-row-model.ts';
import { formatTraceDuration } from './turn-trace-duration.ts';
import type { TurnTraceTotals } from './turn-trace-view.ts';

/**
 * A turn's totals as one muted line above its rows — `32s · 8 calls ·
 * 3 sub-agents · 1 failed · Done` — so they read as a caption, never as
 * another row. The host's action (the way back to the turn's Chat) ends the
 * line, on the trace's right edge. Failures alone take `danger`.
 */
export function TurnTraceStatsStrip({
    action,
    parts,
}: {
    action?: React.ReactNode;
    parts: readonly string[];
}) {
    return (
        <div className="flex min-w-0 items-center justify-between gap-3 px-2" data-trace-strip>
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-muted text-xs tabular-nums">
                {parts.map((part, index) => (
                    <span className="flex items-center gap-x-1.5" key={part}>
                        {index > 0 ? <span aria-hidden>·</span> : null}
                        <span className={isFailure(part) ? 'text-danger' : undefined}>{part}</span>
                    </span>
                ))}
            </p>
            {action ? <div className="flex shrink-0">{action}</div> : null}
        </div>
    );
}

/** The journal's totals: a count of zero is no fact. */
export function journalStripParts(
    status: AgentExecutionJournal['status'] | null,
    totals: TurnTraceTotals
): readonly string[] {
    const label = totals.isRunning ? 'Running' : status ? statusLabels[status] : null;
    return compact([
        formatTraceDuration(totals.durationMs, { isRunning: totals.isRunning }),
        count(totals.calls, 'call', 'calls'),
        count(totals.subagents, 'sub-agent', 'sub-agents'),
        count(totals.images, 'image', 'images'),
        totals.failed > 0 ? `${totals.failed.toLocaleString()} failed` : null,
        label,
    ]);
}

/**
 * The turn summary's line, for a viewer or moment without the journal: its
 * length, what it did in words, and how it ended, on the same line the
 * journal's totals later take.
 */
export function summaryStripParts(turn: AgentActivityTurn, now: number): readonly string[] {
    const running = turn.kind === 'active';
    const durationMs = running ? now - Date.parse(turn.startedAt) : turn.durationMs;
    return compact([
        formatTraceDuration(Number.isNaN(durationMs) ? null : durationMs, { isRunning: running }),
        // One separator rhythm: the outcome's own `·` joins become the line's.
        ...formatTurnOutcome(turn).split(' · '),
        running ? 'Running' : statusLabels[turn.status],
    ]);
}

const statusLabels: Record<AgentExecutionJournal['status'], string> = {
    completed: 'Done',
    failed: 'Failed',
    interrupted: 'Interrupted',
    running: 'Running',
};

function isFailure(part: string): boolean {
    return part.endsWith(' failed');
}

function compact(parts: readonly (string | null)[]): readonly string[] {
    return parts.filter((part): part is string => part !== null && part !== '');
}

function count(value: number, one: string, many: string): string | null {
    return value > 0 ? `${value.toLocaleString()} ${value === 1 ? one : many}` : null;
}
