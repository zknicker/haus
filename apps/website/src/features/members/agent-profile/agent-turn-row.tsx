import { Spinner } from '@heroui/react';
import { AlertCircleIcon, StopCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { formatShortTime } from '../../../lib/format.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import { formatTurnOutcome } from './agent-turn-outcome.ts';
import {
    formatTurnDuration,
    getTurnRowStatus,
    type TurnRowStatus,
    type TurnRowTitle,
} from './agent-turn-row-model.ts';
import type { RecentActivityRow } from './recent-activity-rows.ts';

/**
 * One turn as one log line on fixed columns: start time, a status glyph only
 * when it is news (failed, interrupted, still working), the request with its
 * Chat, and the turn's length. Every row shares the columns, so times,
 * requests, and lengths each line up down the list. A turn with no request
 * the reader may see is titled, muted, by what it did. The profile hub's
 * Recent activity card reads the Activity log's turns this compactly.
 */
export function TurnRowContent({ row, title }: { row: RecentActivityRow; title: TurnRowTitle }) {
    const turn = row.latest;
    const status = getTurnRowStatus(row);

    return (
        // `w-0` keeps the long title out of the trigger's min-content width, so
        // the row truncates instead of widening the list past the viewport.
        <span
            className="me-2 grid w-0 min-w-0 flex-1 grid-cols-[4.25rem_1rem_minmax(0,1fr)_3.25rem] items-start gap-x-2 text-left text-sm leading-5 font-normal"
            data-turn-row
        >
            <time className="text-muted whitespace-nowrap tabular-nums" dateTime={turn.startedAt}>
                {formatShortTime(turn.startedAt)}
            </time>
            <span className="flex h-5 items-center justify-center">
                {status ? <TurnStatusGlyph status={status} /> : null}
            </span>
            <TurnRowTitleLine
                count={status?.kind === 'failed' ? row.count : 1}
                title={title}
                turn={turn}
            />
            <span className="text-muted text-end whitespace-nowrap tabular-nums">
                <TurnDuration turn={turn} />
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

export function TurnRowTitleLine({
    count,
    title,
    turn,
}: {
    /** Folded repeats of a failure: `3×`. */
    count: number;
    title: TurnRowTitle;
    turn: AgentActivityTurn;
}) {
    const repeats =
        count > 1 ? <span className="text-danger shrink-0 tabular-nums">{count}×</span> : null;
    if (title.kind === 'none') {
        return (
            <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="text-muted min-w-0 truncate">{formatTurnOutcome(turn)}</span>
                {repeats}
            </span>
        );
    }
    return (
        <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="text-foreground min-w-0 truncate">
                {title.kind === 'text' ? title.text : null}
            </span>
            {/* Regular weight even after a log header's medium title. */}
            {title.place ? (
                <span className="text-muted shrink-0 font-normal">{title.place}</span>
            ) : null}
            {repeats}
        </span>
    );
}

export function TurnStatusGlyph({ status }: { status: NonNullable<TurnRowStatus> }) {
    if (status.kind === 'working') {
        return (
            <span className="text-accent flex" title="Working">
                <Spinner color="current" size="sm" />
                <span className="sr-only">Working</span>
            </span>
        );
    }
    const failed = status.kind === 'failed';
    const label = failed ? 'Failed' : 'Interrupted';
    return (
        <span className={failed ? 'text-danger flex' : 'text-warning flex'} title={label}>
            <Icon className="size-4" icon={failed ? AlertCircleIcon : StopCircleIcon} />
            <span className="sr-only">{label}</span>
        </span>
    );
}

/** The one ticking clock on the page, mounted only in a running turn's row. */
function ActiveTurnDuration({ startedAt }: { startedAt: string }) {
    const now = useRelativeNow(1000);
    return <span>{formatTurnDuration(now - Date.parse(startedAt))}</span>;
}
