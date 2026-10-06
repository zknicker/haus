import { Spinner } from '@heroui/react';
import { AlertCircleIcon, StopCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { formatShortTime } from '../../../lib/format.ts';
import {
    formatTurnDuration,
    formatTurnOutcome,
    getTurnRowStatus,
    type TurnRowStatus,
    type TurnRowTitle,
} from './agent-turn-row-model.ts';
import type { RecentActivityRow } from './recent-activity-rows.ts';

/**
 * One turn as a row: the request that woke it (with its Chat), the actions it
 * took beneath, and its length and start time in right-aligned columns. Status
 * shows only when it is news — failed, interrupted, or still working.
 */
export function TurnRowContent({ row, title }: { row: RecentActivityRow; title: TurnRowTitle }) {
    const outcome = formatTurnOutcome(row.latest);
    const status = getTurnRowStatus(row);

    return (
        // `w-0` keeps the long title out of the trigger's min-content width, so
        // the row truncates instead of widening the Accordion past the viewport.
        <span className="me-2 flex w-0 min-w-0 flex-1 items-center gap-3 text-left font-normal text-sm">
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-h-5 min-w-0 items-center gap-1.5">
                    {status ? <TurnRowStatusMark status={status} /> : null}
                    {title.kind === 'none' ? (
                        <span className="min-w-0 truncate text-foreground">{outcome}</span>
                    ) : (
                        <>
                            <span className="min-w-0 truncate font-medium text-foreground">
                                {title.kind === 'text' ? title.text : null}
                            </span>
                            {title.place ? (
                                <span className="shrink-0 text-muted">{title.place}</span>
                            ) : null}
                        </>
                    )}
                </span>
                {title.kind === 'none' ? null : (
                    <span className="min-w-0 truncate text-muted">{outcome}</span>
                )}
            </span>
            <span className="w-14 shrink-0 text-right text-muted tabular-nums">
                {row.latest.kind === 'active' ? (
                    <ActiveTurnDuration startedAt={row.latest.startedAt} />
                ) : (
                    formatTurnDuration(row.latest.durationMs)
                )}
            </span>
            <time
                className="w-16 shrink-0 text-right text-muted tabular-nums"
                dateTime={row.latest.startedAt}
            >
                {formatShortTime(row.latest.startedAt)}
            </time>
        </span>
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
    return <>{formatTurnDuration(now - Date.parse(startedAt))}</>;
}
