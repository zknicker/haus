import * as React from 'react';
import { cn } from '../../lib/utils.ts';
import { tracePad, useTraceDepthStyle } from './turn-trace-depth.tsx';
import { formatTraceDuration } from './turn-trace-duration.ts';
import type { TraceKind } from './turn-trace-kind.ts';
import type { TurnTraceLane, TurnTraceTiming } from './turn-trace-timing.ts';
import type { TurnTraceStatus } from './turn-trace-tool-model.ts';
import { TraceLane, TraceTrack } from './turn-trace-track.tsx';

/**
 * The trace's one row grid. Every row at every depth — call, fold, Haus
 * bookkeeping, sub-agent, a sub-agent's own calls, reasoning — lays out on
 * these four columns: the label, the waterfall track, the duration, and the
 * disclosure slot. Depth indents inside the label cell only, so the track and
 * duration columns never move. The label narrows with the trace, never below
 * what an icon and a short name need.
 */
export const traceGridClass =
    'grid grid-cols-[clamp(8rem,45%,28rem)_minmax(0,1fr)_3.75rem_1rem] items-center gap-x-2';

/**
 * The Activity log leads every row with a time column — a turn's clock time,
 * a step's offset from the turn's start — and drops the track on a narrow log
 * (`@container/activity-log`).
 */
const traceLogGridClass = cn(
    'grid grid-cols-[4.5rem_clamp(10rem,40%,32rem)_minmax(0,1fr)_3.75rem_1rem] items-center gap-x-2',
    '@max-2xl/activity-log:grid-cols-[3.75rem_minmax(0,1fr)_3rem_1rem]'
);

/** Which grid a row lays out on: the trace's four columns, or the log's five. */
export type TraceLayout = 'log' | 'trace';

const TraceLayoutContext = React.createContext<TraceLayout>('trace');

export function TraceLayoutProvider({
    children,
    layout,
}: {
    children: React.ReactNode;
    layout: TraceLayout;
}) {
    return <TraceLayoutContext value={layout}>{children}</TraceLayoutContext>;
}

export function useTraceLayout(): TraceLayout {
    return React.use(TraceLayoutContext);
}

/**
 * Where a row's label text starts, from the row's edge: the log's time column
 * (`--trace-lead`), the row's inline pad, the depth indent (`--trace-indent`), the icon
 * (`size-3.5`), and its gap (2 steps).
 */
export const traceTextInset = `calc(var(--trace-lead, 0rem) + ${tracePad} + var(--trace-indent, 0rem) + var(--spacing) * 5.5)`;

// The overview paints its step marks with the bars' fill rule.
export { barTone } from './turn-trace-track.tsx';

/** What a bar says about the work: its kind's hue, one per kind across the trace. */
export type TraceBarKind = TraceKind;

export interface TraceBar {
    readonly kind: TraceBarKind;
    readonly lane?: TurnTraceLane | null;
    readonly status: TurnTraceStatus;
    readonly timing: TurnTraceTiming;
}

/** A row's cells: what it was, when it ran, and for how long. */
export interface TraceCellsProps {
    readonly bars: readonly TraceBar[];
    readonly line: React.ReactNode;
    /** Present on rows that open; leaves keep the slot so labels never shift. */
    readonly slot?: React.ReactNode;
    readonly timing?: TurnTraceTiming | null;
    readonly tone?: TraceRowTone;
}

/** A failed step tints its whole row; everything else rests on the trace's ground. */
export type TraceRowTone = 'danger' | 'default';

/** The row frame: the grid, the danger tint, and the depth every cell reads. */
export function traceRowClass(
    tone: TraceRowTone = 'default',
    layout: TraceLayout = 'trace'
): string {
    return cn(
        layout === 'log' ? traceLogGridClass : traceGridClass,
        // Rows are controls, not prose: the desktop arrow, never the text I-beam.
        'min-h-8 w-full cursor-default text-start text-sm',
        // The log's rows run edge to edge; a trace's rows are rounded insets.
        layout === 'log' ? 'px-(--trace-pad)' : 'rounded-lg px-2',
        tone === 'danger'
            ? // Opaque, so it re-paints the turn's lift the turn painted beneath it.
              'bg-[linear-gradient(var(--trace-row-lift),var(--trace-row-lift)),linear-gradient(var(--trace-turn-lift),var(--trace-turn-lift))] bg-trace-row-danger [--trace-ring:var(--trace-row-danger)]'
            : 'bg-[linear-gradient(var(--trace-row-lift),var(--trace-row-lift))]'
    );
}

/**
 * The highlight is additive: a hovered row, or a turn the overview points at,
 * lays `--trace-row-highlight` over whatever the row rests on, so a plain row
 * and a failed row's tint lift by the same step. Bars ring in the same layers.
 */
export const traceRowHoverClass = 'hover:[--trace-row-lift:var(--trace-row-highlight)]';

/** The turn paints its lift; rows inherit it for their bar rings and tints. */
export function traceTurnClass(isHighlighted: boolean): string {
    return cn(
        'bg-[linear-gradient(var(--trace-turn-lift),var(--trace-turn-lift))]',
        isHighlighted && '[--trace-turn-lift:var(--trace-row-highlight)]'
    );
}

export function TraceCells({ bars, line, slot, timing = null, tone = 'default' }: TraceCellsProps) {
    const layout = useTraceLayout();
    return (
        <>
            {layout === 'log' ? <TraceTime timing={timing} /> : null}
            <span
                className="flex min-w-0 items-center gap-2"
                data-trace-cell="label"
                style={{ paddingInlineStart: 'var(--trace-indent, 0rem)' }}
            >
                {line}
                <TraceLeader layout={layout} tone={tone} />
            </span>
            <TraceTrack bars={bars} layout={layout} tone={tone} />
            <TraceDuration timing={timing} />
            <span className="flex size-4 items-center justify-center" data-trace-cell="slot">
                {slot}
            </span>
        </>
    );
}

/**
 * What a row opens to that is not itself a row — evidence, a report, a
 * message — starts on the row's label text. In a chat's trace it runs to the
 * edge. In the log it stays in the time and label columns and the track
 * column beside it keeps the turn's gridlines, so the chart reads unbroken
 * from the ruler to the last row with bodies open. Nested rows never sit in
 * here: they keep the trace's columns.
 */
export function TraceBody({ children }: { children: React.ReactNode }) {
    const layout = useTraceLayout();
    const style = useTraceDepthStyle();
    if (layout === 'trace') {
        return (
            <div
                className="grid min-w-0 gap-2 pe-2.5 pt-1 pb-2"
                data-trace-body
                style={{ ...style, paddingInlineStart: traceTextInset }}
            >
                {children}
            </div>
        );
    }
    return (
        <div className={cn(traceLogGridClass, 'px-(--trace-pad)')} data-trace-body style={style}>
            <div
                // The padding lives on the cell, not the grid, so the lane stretches the body's full height.
                className="@max-2xl/activity-log:col-span-full col-span-2 grid min-w-0 gap-2 pe-2 pt-1 pb-2"
                style={{ paddingInlineStart: traceLogTextInset }}
            >
                {children}
            </div>
            <TraceLane />
        </div>
    );
}

/** The log body's label text start from its first column: `traceTextInset` less the row pad. */
const traceLogTextInset =
    'calc(var(--trace-lead, 0rem) + var(--trace-indent, 0rem) + var(--spacing) * 5.5)';

/**
 * The dotted line from a label's end at the row's center. It runs on across
 * the column gap to the track's edge as one element: a second segment sat a
 * half pixel lower with its own dot phase, so the seam glitched. In the log it
 * stops there, at the lane's 0 edge (and at the label's end once a narrow log
 * drops the track); in a chat's trace the track carries it on (`TraceTrack`).
 */
function TraceLeader({ layout, tone }: { layout: TraceLayout; tone: TraceRowTone }) {
    return (
        <span
            aria-hidden
            className={cn(
                'h-0 min-w-0 flex-1 border-t border-dotted',
                // Cancels the label cell's share of the column gap, not a HeroUI part's padding.
                '-me-2',
                layout === 'log' && '@max-2xl/activity-log:me-0',
                tone === 'danger' ? 'border-trace-leader-danger' : 'border-border'
            )}
            data-trace-leader
        />
    );
}

/**
 * The log's time column: a step's offset from its turn's start (`+0.4s`,
 * `+12s`), carrying its span for the overview's linked hover.
 */
function TraceTime({ timing }: { timing: TurnTraceTiming | null }) {
    return (
        <span
            className="whitespace-nowrap text-muted text-sm tabular-nums"
            data-duration-ms={timing?.durationMs ?? undefined}
            data-offset-ms={timing?.offsetMs}
            data-trace-cell="time"
        >
            {timing ? formatTraceOffset(timing.offsetMs) : null}
        </span>
    );
}

function formatTraceOffset(offsetMs: number): string {
    const seconds = offsetMs / 1000;
    if (seconds < 10) {
        return `+${seconds.toFixed(1)}s`;
    }
    if (seconds < 60) {
        return `+${Math.round(seconds)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return rest === 0 ? `+${minutes}m` : `+${minutes}m ${rest}s`;
}

/** The duration column: right-aligned tabular figures on one line, or nothing. */
function TraceDuration({ timing }: { timing: TurnTraceTiming | null }) {
    const duration = timing
        ? formatTraceDuration(timing.durationMs, { isRunning: timing.isRunning })
        : null;
    return (
        <span
            className="whitespace-nowrap text-end text-muted text-sm tabular-nums"
            data-trace-cell="duration"
        >
            {duration}
        </span>
    );
}
