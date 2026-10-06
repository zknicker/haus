import { Spinner } from '@heroui/react';
import { AlertCircleIcon, StopCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { formatShortTime } from '../../../lib/format.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import {
    formatTurnDuration,
    formatTurnOutcome,
    getTurnRowStatus,
    type TurnRowStatus,
    type TurnRowTitle,
} from './agent-turn-row-model.ts';
import type { RecentActivityRow } from './recent-activity-rows.ts';

/**
 * One turn as a row: the request that woke it (with its Chat) over the actions
 * it took, then a fixed numeric column — length over start time — so every
 * row's numbers share one right edge. Status shows only when it is news
 * (failed, interrupted, or still working), in its own slot before the numbers.
 */
export function TurnRowContent({ row, title }: { row: RecentActivityRow; title: TurnRowTitle }) {
    const outcome = formatTurnOutcome(row.latest);
    const status = getTurnRowStatus(row);

    return (
        // `w-0` keeps the long title out of the trigger's min-content width, so
        // the row truncates instead of widening the Accordion past the viewport.
        <span className="me-2 flex w-0 min-w-0 flex-1 items-center gap-3 text-left font-normal text-sm">
            <span className="flex min-w-0 flex-1 flex-col">
                {title.kind === 'none' ? (
                    // No request the reader may see: what the turn did is the
                    // whole row, one line set against the two-line numbers.
                    <span className="min-w-0 truncate text-foreground">{outcome}</span>
                ) : (
                    <>
                        <span className="flex min-h-5 min-w-0 items-baseline gap-1.5">
                            <span className="min-w-0 truncate font-medium text-foreground">
                                {title.kind === 'text' ? title.text : null}
                            </span>
                            {title.place ? (
                                <span className="shrink-0 text-muted">{title.place}</span>
                            ) : null}
                        </span>
                        <span className="min-w-0 truncate text-muted">{outcome}</span>
                    </>
                )}
            </span>
            {status ? <TurnRowStatusMark status={status} /> : null}
            <span className="flex w-18 shrink-0 flex-col items-end whitespace-nowrap text-muted tabular-nums">
                <TurnDuration turn={row.latest} />
                <time dateTime={row.latest.startedAt}>{formatShortTime(row.latest.startedAt)}</time>
            </span>
        </span>
    );
}

/** A turn's length; a running turn ticks on its own clock. */
export function TurnDuration({ turn }: { turn: AgentActivityTurn }) {
    return turn.kind === 'active' ? (
        <ActiveTurnDuration startedAt={turn.startedAt} />
    ) : (
        <span>{formatTurnDuration(turn.durationMs)}</span>
    );
}

function TurnRowStatusMark({ status }: { status: NonNullable<TurnRowStatus> }) {
    if (status.kind === 'working') {
        return (
            <span className="flex shrink-0 items-center gap-1 text-accent">
                <Spinner color="current" size="sm" />
                <span className="max-sm:sr-only">Working</span>
            </span>
        );
    }
    const failed = status.kind === 'failed';
    return (
        <span
            className={
                failed
                    ? 'flex shrink-0 items-center gap-1 text-danger'
                    : 'flex shrink-0 items-center gap-1 text-warning'
            }
        >
            <Icon className="size-4" icon={failed ? AlertCircleIcon : StopCircleIcon} />
            {/* On a phone the mark alone carries the status; the title needs the room. */}
            <span className="max-sm:sr-only">{failed ? 'Failed' : 'Interrupted'}</span>
            {status.count > 1 ? <span className="tabular-nums">{status.count}×</span> : null}
        </span>
    );
}

/** The one ticking clock on the page, mounted only in a running turn's row. */
function ActiveTurnDuration({ startedAt }: { startedAt: string }) {
    const now = useRelativeNow(1000);
    return <span>{formatTurnDuration(now - Date.parse(startedAt))}</span>;
}
