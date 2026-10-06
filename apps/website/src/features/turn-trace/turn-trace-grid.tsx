import * as React from 'react';
import { cn } from '../../lib/utils.ts';
import { formatTraceDuration } from './turn-trace-duration.ts';
import { useTurnTraceScope } from './turn-trace-scope.tsx';
import type { TurnTraceLane, TurnTraceTiming } from './turn-trace-timing.ts';
import type { TurnTraceStatus } from './turn-trace-tool-model.ts';

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

/** One depth step inside the label cell. */
const traceIndentRem = 0.75;

/**
 * Where a row's label text starts, from the row's edge: the row's inline pad
 * (2 steps), the depth indent, the icon (`size-3.5`), and its gap (2 steps).
 */
export const traceTextInset = `calc(var(--trace-depth) * ${traceIndentRem}rem + var(--spacing) * 7.5)`;

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
export function traceRowClass(tone: TraceRowTone = 'default'): string {
    return cn(
        traceGridClass,
        'min-h-8 w-full rounded-lg px-2 text-start text-sm',
        tone === 'danger' && 'bg-trace-row-danger [--trace-ring:var(--trace-row-danger)]'
    );
}

export function TraceCells({ bars, line, slot, timing = null, tone = 'default' }: TraceCellsProps) {
    return (
        <>
            <span
                className="flex min-w-0 items-center gap-2"
                data-trace-cell="label"
                style={{ paddingInlineStart: `calc(var(--trace-depth) * ${traceIndentRem}rem)` }}
            >
                {line}
                <TraceLeader tone={tone} />
            </span>
            <TraceTrack bars={bars} tone={tone} />
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

/** The dotted line from a label's end, carried across the track at the row's center. */
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
 * The waterfall track: the leader runs its full width (and across the column
 * gap, so it meets the label's), and each bar sits over it on the turn's own
 * axis, ringed in the row's ground so it reads as cut from the line. Parallel
 * members stack as lanes in one bar.
 */
function TraceTrack({ bars, tone }: { bars: readonly TraceBar[]; tone: TraceRowTone }) {
    const { axisMs } = useTurnTraceScope();
    return (
        <span aria-hidden className="relative h-4 min-w-0" data-trace-cell="track">
            <span
                className={cn(
                    'absolute -inset-s-2 inset-e-0 top-1/2 border-t border-dotted',
                    tone === 'danger' ? 'border-trace-leader-danger' : 'border-border'
                )}
            />
            {axisMs > 0
                ? bars.map((bar, index) => (
                      <span
                          className={cn(
                              'absolute min-w-1 rounded-full shadow-[0_0_0_2px_var(--trace-ring)]',
                              'transition-[left,width] duration-200 ease-linear motion-reduce:transition-none',
                              barTone(bar),
                              bar.status === 'running' && 'motion-safe:animate-pulse'
                          )}
                          data-trace-bar={bar.status === 'failed' ? 'danger' : bar.kind}
                          // biome-ignore lint/suspicious/noArrayIndexKey: bars never reorder within one row.
                          key={index}
                          style={placeBar(bar, axisMs)}
                      />
                  ))
                : null}
        </span>
    );
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

function barTone(bar: TraceBar): string {
    if (bar.status === 'failed') {
        return 'bg-danger';
    }
    if (bar.status === 'warning') {
        return 'bg-warning';
    }
    if (bar.status === 'interrupted') {
        return 'bg-trace-quiet';
    }
    return barKinds[bar.kind];
}

const barKinds: Record<TraceBarKind, string> = {
    quiet: 'bg-trace-quiet',
    step: 'bg-trace-step',
    tool: 'bg-trace-tool',
};

function placeBar(bar: TraceBar, axisMs: number): React.CSSProperties {
    const left = Math.min(100, (bar.timing.offsetMs / axisMs) * 100);
    const width = Math.min(100 - left, ((bar.timing.durationMs ?? 0) / axisMs) * 100);
    const lanes = bar.lane?.lanes ?? 1;
    const lane = bar.lane && lanes > 1 ? bar.lane.lane : 0;
    return {
        height: lanes > 1 ? `calc(${100 / lanes}% - 1px)` : '6px',
        left: `${left}%`,
        top: lanes > 1 ? `${(lane / lanes) * 100}%` : 'calc(50% - 3px)',
        width: `${width}%`,
    };
}
