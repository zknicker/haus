import * as React from 'react';
import { cn } from '../../lib/utils.ts';
import { formatTraceDuration } from './turn-trace-duration.ts';
import type { TurnTraceLane, TurnTraceTiming } from './turn-trace-timing.ts';
import type { TurnTraceStatus } from './turn-trace-tool-model.ts';
import { TraceTrack } from './turn-trace-track.tsx';

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

/** One depth step inside the label cell. */
const traceIndentRem = 0.75;

/**
 * A row's inline pad: 2 steps in a trace's rounded rows; the log's
 * edge-to-edge rows set `--trace-pad` to the page gutter.
 */
const tracePad = 'var(--trace-pad, calc(var(--spacing) * 2))';

/**
 * Where a row's label text starts, from the row's edge: the log's time column
 * (`--trace-lead`), the row's inline pad, the depth indent, the icon
 * (`size-3.5`), and its gap (2 steps).
 */
export const traceTextInset = `calc(var(--trace-lead, 0rem) + ${tracePad} + var(--trace-depth) * ${traceIndentRem}rem + var(--spacing) * 5.5)`;

// The overview paints its step marks with the bars' fill rule.
export { barTone } from './turn-trace-track.tsx';

/** What a bar says about the work: a step that ran others, a call, or Haus upkeep. */
export type TraceBarKind = 'quiet' | 'step' | 'tool';

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

const TraceDepthContext = React.createContext(0);

/** Rows inside this sit one depth step further in, on the same columns. */
export function TraceNested({ children }: { children: React.ReactNode }) {
    const depth = React.use(TraceDepthContext);
    return <TraceDepthContext value={depth + 1}>{children}</TraceDepthContext>;
}

/** The depth's custom property, set once per row or body so indents derive from it. */
export function useTraceDepthStyle(): React.CSSProperties {
    const depth = React.use(TraceDepthContext);
    return { '--trace-depth': depth } as React.CSSProperties;
}

/** The row frame: the grid, the danger tint, and the depth every cell reads. */
export function traceRowClass(
    tone: TraceRowTone = 'default',
    layout: TraceLayout = 'trace'
): string {
    return cn(
        layout === 'log' ? traceLogGridClass : traceGridClass,
        'min-h-8 w-full text-start text-sm',
        // The log's rows run edge to edge; a trace's rows are rounded insets.
        layout === 'log' ? 'px-(--trace-pad)' : 'rounded-lg px-2',
        tone === 'danger' && 'bg-trace-row-danger [--trace-ring:var(--trace-row-danger)]'
    );
}

/**
 * The highlight fill — a hovered row, or a turn the overview points at. It
 * wins over the danger tint: a failed row highlights like its neighbors and
 * keeps only its red icon, bar, and leader. Bars ring in the fill, not the
 * ground. The turn form rebinds the danger tint so its failed rows join in.
 */
export const traceRowHoverClass = 'hover:bg-default hover:[--trace-ring:var(--default)]';
export const traceTurnHighlightClass =
    'bg-default [--trace-ring:var(--default)] [--trace-row-danger:var(--default)]';

export function TraceCells({ bars, line, slot, timing = null, tone = 'default' }: TraceCellsProps) {
    const layout = useTraceLayout();
    return (
        <>
            {layout === 'log' ? <TraceTime timing={timing} /> : null}
            <span
                className="flex min-w-0 items-center gap-2"
                data-trace-cell="label"
                style={{ paddingInlineStart: `calc(var(--trace-depth) * ${traceIndentRem}rem)` }}
            >
                {line}
                <TraceLeader tone={tone} />
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
 * message — starts on the row's label text and stops short of the edge.
 * Nested rows never sit in here: they keep the trace's columns.
 */
export function TraceBody({ children }: { children: React.ReactNode }) {
    return (
        <div
            className="grid min-w-0 gap-2 pe-2.5 pt-1 pb-2"
            data-trace-body
            style={{
                ...useTraceDepthStyle(),
                paddingInlineStart: traceTextInset,
            }}
        >
            {children}
        </div>
    );
}

/**
 * The dotted line from a label's end at the row's center; the track carries
 * it on (`TraceTrack`).
 */
function TraceLeader({ tone }: { tone: TraceRowTone }) {
    return (
        <span
            aria-hidden
            className={cn(
                'h-0 min-w-0 flex-1 border-t border-dotted',
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
