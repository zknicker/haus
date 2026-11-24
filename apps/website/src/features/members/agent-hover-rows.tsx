import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { formatRelativeTime } from '../../lib/format.ts';
import type { HoverLogLine, HoverTimedLine } from './agent-hover-activity-model.ts';
import { formatTurnOutcome } from './agent-profile/agent-turn-outcome.ts';
import { getTurnRowStatus, type TurnRowTitle } from './agent-profile/agent-turn-row-model.ts';
import { TurnDuration } from './agent-profile/agent-turn-row.tsx';
import type { RecentActivityRow } from './agent-profile/recent-activity-rows.ts';

/**
 * The hover card's rows. Every length and time sits in one right-aligned
 * numeric column, in the turn list's duration format, so the card reads like a
 * compact slice of Activity History.
 */
export function AgentHoverTurn({ row, title }: { row: RecentActivityRow; title: TurnRowTitle }) {
    const now = useRelativeNow();
    const outcome = formatTurnOutcome(row.latest);
    const status = getTurnRowStatus(row);
    const statusLabel =
        status && status.kind !== 'working'
            ? `${status.kind === 'failed' ? 'Failed' : 'Interrupted'}${status.count > 1 ? ` ${status.count}×` : ''}`
            : null;
    const primary = title.kind === 'none' ? outcome : title.kind === 'text' ? title.text : null;
    const details = (title.kind === 'none' ? [statusLabel] : [statusLabel, title.place, outcome])
        .filter(Boolean)
        .join(' · ');

    return (
        <li className="flex min-w-0 items-center gap-2">
            <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full ${statusDots[status?.kind ?? 'settled']}`}
            />
            <span className="text-foreground min-h-4 min-w-0 shrink truncate">{primary}</span>
            {details ? (
                <span
                    className={`min-w-0 flex-1 truncate ${status?.kind === 'failed' ? 'text-danger' : 'text-muted'}`}
                >
                    {details}
                </span>
            ) : (
                <span className="flex-1" />
            )}
            <span className="text-muted shrink-0 tabular-nums">
                <TurnDuration turn={row.latest} />
            </span>
            <time className={numericColumn} dateTime={row.latest.startedAt}>
                {formatRelativeTime(row.latest.startedAt, now)}
            </time>
        </li>
    );
}

const statusDots = {
    failed: 'bg-danger',
    interrupted: 'bg-warning',
    settled: 'bg-success',
    working: 'bg-accent',
} as const;

/** Words on the left, their length in the numeric column. */
export function HoverTimedRow({ className, line }: { className: string; line: HoverTimedLine }) {
    return (
        <p className="flex min-w-0 items-center gap-2">
            <span className={`min-w-0 flex-1 truncate ${className}`}>{line.label}</span>
            {line.elapsed ? <span className={numericColumn}>{line.elapsed}</span> : null}
        </p>
    );
}

/** One step of the running turn's log, its time in the numeric column. */
export function HoverLogRow({ line }: { line: HoverLogLine }) {
    return (
        <li className="flex min-w-0 items-center gap-2">
            <span className="text-foreground min-w-0 flex-1 truncate">{line.label}</span>
            <time className={numericColumn} dateTime={line.occurredAt}>
                {line.time}
            </time>
        </li>
    );
}

/** The card's one right-aligned numeric column: every length and time shares its edge. */
const numericColumn = 'w-14 shrink-0 whitespace-nowrap text-right text-muted tabular-nums';
