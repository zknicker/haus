import type * as React from 'react';
import { cn } from '../../lib/utils.ts';
import type { TraceBar, TraceLayout, TraceRowTone } from './turn-trace-grid.tsx';
import { traceKindFill } from './turn-trace-kind.ts';
import { placeTick } from './turn-trace-scale.ts';
import { useTurnTraceScope } from './turn-trace-scope.tsx';

/**
 * The waterfall track. In a chat's trace the label's leader runs on across the
 * lane, on the label leader's centerline. In the log the label's leader stops
 * at the lane's 0 edge, and the lane holds only the turn's gridlines and bars.
 * Each bar sits on the turn's axis, ringed in the row's ground so it reads as
 * cut from what it crosses. Parallel members stack as lanes in one bar.
 */
export function TraceTrack({
    bars,
    layout,
    tone,
}: {
    bars: readonly TraceBar[];
    layout: TraceLayout;
    tone: TraceRowTone;
}) {
    const { axisMs, gridTicks } = useTurnTraceScope();
    const isLog = layout === 'log';
    return (
        <span
            aria-hidden
            className={cn(
                'relative @max-2xl/activity-log:hidden min-w-0',
                // The log's lane fills the row so its gridlines run row to row.
                isLog ? 'self-stretch' : 'h-4'
            )}
            data-trace-cell="track"
        >
            {isLog ? null : (
                <span
                    className={cn(
                        // The label leader's 1px border box centers on the row: its top is 0.5px up.
                        'absolute inset-x-0 top-[calc(50%-0.5px)] border-t border-dotted',
                        tone === 'danger' ? 'border-trace-leader-danger' : 'border-border'
                    )}
                    data-trace-leader-lane
                />
            )}
            {isLog && gridTicks ? <TraceGridlines axisMs={axisMs} ticks={gridTicks} /> : null}
            <span className="absolute inset-x-0 top-1/2 h-4 -translate-y-1/2">
                {axisMs > 0
                    ? bars.map((bar, index) => (
                          <span
                              className={cn(
                                  // The ring stacks the row's layers, so it matches the fill behind it.
                                  'absolute min-w-1 rounded-full shadow-[0_0_0_2px_var(--trace-row-lift),0_0_0_2px_var(--trace-turn-lift),0_0_0_2px_var(--trace-ring)]',
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
        </span>
    );
}

/**
 * The log's lane beside an open row's body: the turn's gridlines only, so the
 * 0 edge and the ticks run on through the body to the rows below it.
 */
export function TraceLane() {
    const { axisMs, gridTicks } = useTurnTraceScope();
    return (
        <span
            aria-hidden
            className="relative @max-2xl/activity-log:hidden min-w-0 self-stretch"
            data-trace-cell="lane"
        >
            {gridTicks ? <TraceGridlines axisMs={axisMs} ticks={gridTicks} /> : null}
        </span>
    );
}

/**
 * The ruler's ticks carried down a step row: hairlines, the 0 line darkest so
 * the turn's steps share one visible left edge. Each reaches 1px above the
 * row to bridge the list's hairline gap.
 */
function TraceGridlines({ axisMs, ticks }: { axisMs: number; ticks: readonly number[] }) {
    return ticks.map((tick) => (
        <span
            className={cn(
                'absolute -top-px bottom-0 w-px',
                'transition-[left] duration-200 ease-linear motion-reduce:transition-none',
                tick === 0 ? 'bg-trace-axis' : 'bg-trace-grid'
            )}
            data-trace-gridline={tick}
            key={tick}
            style={{ left: placeTick(tick, axisMs) }}
        />
    ));
}

/** A bar's fill; the log's overview paints step marks with the same rule. */
export function barTone(bar: Pick<TraceBar, 'kind' | 'status'>): string {
    if (bar.status === 'failed') {
        return 'bg-danger';
    }
    if (bar.status === 'warning') {
        return 'bg-warning';
    }
    if (bar.status === 'interrupted') {
        return 'bg-trace-quiet';
    }
    return traceKindFill[bar.kind];
}

/** A bar's box as fractions of the axis, clamped inside the lane. */
export function placeBar(bar: TraceBar, axisMs: number): React.CSSProperties {
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
