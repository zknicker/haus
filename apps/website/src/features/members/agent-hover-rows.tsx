import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { formatRelativeTime } from '../../lib/format.ts';
import type { HoverLogLine, HoverTimedLine } from './agent-hover-activity-model.ts';
import { TurnDuration } from './agent-profile/agent-turn-row.tsx';
import {
    formatTurnOutcome,
    getTurnRowStatus,
    type TurnRowTitle,
} from './agent-profile/agent-turn-row-model.ts';
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

    return (
        <li className="flex min-w-0 items-center gap-2">
            <span className="flex min-w-0 flex-1 flex-col">
                {title.kind === 'none' ? (
                    // Same rule as the turn list: no visible request, one outcome line.
                    <span className="min-w-0 truncate text-foreground">{outcome}</span>
                ) : (
                    <>
                        <span className="min-h-4 min-w-0 truncate text-foreground">
                            {title.kind === 'text' ? title.text : null}
                        </span>
                        <span className="min-w-0 truncate text-muted">
                            {title.place ? `${title.place} · ${outcome}` : outcome}
                        </span>
                    </>
                )}
            </span>
            {statusLabel ? (
                <span
                    className={
                        status?.kind === 'failed' ? 'shrink-0 text-danger' : 'shrink-0 text-warning'
                    }
                >
                    {statusLabel}
                </span>
            ) : null}
            <span className={`flex flex-col items-end ${numericColumn}`}>
                <TurnDuration turn={row.latest} />
                <time dateTime={row.latest.startedAt}>
                    {formatRelativeTime(row.latest.startedAt, now)}
                </time>
            </span>
        </li>
    );
}

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
            <span className="min-w-0 flex-1 truncate text-foreground">{line.label}</span>
            <time className={numericColumn} dateTime={line.occurredAt}>
                {line.time}
            </time>
        </li>
    );
}

/** The card's one right-aligned numeric column: every length and time shares its edge. */
const numericColumn = 'w-14 shrink-0 whitespace-nowrap text-right text-muted tabular-nums';
