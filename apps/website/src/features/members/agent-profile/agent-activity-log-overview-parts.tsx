import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import * as React from 'react';
import { formatShortTime } from '../../../lib/format.ts';
import { cn } from '../../../lib/utils.ts';
import type { ActivityLogDay } from './agent-activity-log-entries.ts';
import type { TimelineBreak, TimelineTick } from './agent-activity-log-overview-model.ts';
import { useLinkedHover } from './agent-activity-log-stores.ts';
import { formatTurnDuration, formatTurnOutcome } from './agent-turn-row-model.ts';

/**
 * The strip's one line of text: the day's
 * totals, or, while a turn is pointed at (in the strip or the log), that turn —
 * when, what, how long — in the same place, so the strip names a block even
 * when its rows are out of view. The two crossfade in one grid cell, so the
 * line never moves; reduced motion swaps them at once.
 */
export function OverviewReadout({
    children,
    day,
}: {
    children: React.ReactNode;
    day: ActivityLogDay;
}) {
    const linked = useLinkedHover();
    const reducedMotion = useReducedMotion();
    const entry = linked
        ? day.entries.find((candidate) => candidate.row.latest.runId === linked.runId)
        : undefined;
    const turn = entry?.row.latest;
    return (
        <p className="ms-auto grid min-w-0 ps-6 text-end text-muted text-sm tabular-nums">
            <AnimatePresence initial={false}>
                <motion.span
                    animate={{ opacity: 1 }}
                    className="col-start-1 row-start-1 truncate"
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    key={turn?.runId ?? 'totals'}
                    transition={{ duration: reducedMotion ? 0 : 0.14, ease: 'easeOut' }}
                >
                    {entry && turn ? (
                        <>
                            {`${formatShortTime(turn.startedAt)} · `}
                            <span className="text-foreground">
                                {entry.title.kind === 'text'
                                    ? entry.title.text
                                    : formatTurnOutcome(turn)}
                            </span>
                            {` · ${formatTurnDuration(
                                turn.kind === 'active'
                                    ? Date.now() - Date.parse(turn.startedAt)
                                    : turn.durationMs
                            )}`}
                        </>
                    ) : (
                        children
                    )}
                </motion.span>
            </AnimatePresence>
        </p>
    );
}

/**
 * The ruler under the lane: a baseline under each busy stretch, a broken-axis
 * mark where idle time folds, ticks hanging from the baseline. A stretch's
 * first turn is named from its block's left edge; round times sit centered;
 * Now closes today at the edge. Am/pm is named only where it changes.
 */
export function OverviewRuler({
    breaks,
    spans,
    ticks,
}: {
    breaks: readonly TimelineBreak[];
    spans: readonly { left: number; width: number }[];
    ticks: readonly TimelineTick[];
}) {
    return (
        <div aria-hidden className="relative @max-2xl/activity-log:hidden h-5">
            {spans.map((span) => (
                <span
                    className="absolute top-0 h-px bg-separator"
                    key={`span-${span.left}`}
                    style={{ left: `${span.left}%`, width: `${span.width}%` }}
                />
            ))}
            {breaks.map((gap) => (
                <span
                    className="absolute -top-1 h-2.5 w-1.5 -translate-x-1/2 -skew-x-[20deg] border-muted border-x"
                    key={`break-${gap.at}`}
                    style={{ left: `${gap.at}%` }}
                    title={`${gap.label} idle`}
                />
            ))}
            {readTickTexts(ticks).map(({ text, tick }) => (
                <React.Fragment key={`tick-${tick.time}`}>
                    <span
                        className={cn(
                            'absolute top-0 h-1 w-px',
                            tick.rank === 'now' ? 'bg-accent' : 'bg-separator',
                            tick.rank === 'now' && '-translate-x-full'
                        )}
                        style={{ left: `${tick.at}%` }}
                    />
                    <span
                        className={cn(
                            'absolute top-1.5 whitespace-nowrap text-xs tabular-nums leading-none',
                            tick.rank === 'now' ? 'font-medium text-accent' : 'text-muted',
                            tick.rank === 'start' && 'text-foreground',
                            tick.rank === 'minor' && '-translate-x-1/2',
                            tick.rank === 'now' && '-translate-x-full'
                        )}
                        style={{ left: `${tick.at}%` }}
                    >
                        {text}
                    </span>
                </React.Fragment>
            ))}
        </div>
    );
}

function readTickTexts(ticks: readonly TimelineTick[]) {
    let period: string | null = null;
    return ticks.map((tick) => {
        if (tick.rank === 'now') {
            return { text: 'Now', tick };
        }
        const [clock = '', next = ''] = formatShortTime(new Date(tick.time).toISOString()).split(
            ' '
        );
        const text = next === period ? clock : `${clock} ${next}`;
        period = next;
        return { text, tick };
    });
}

/** The strip's width in pixels, so its measures hold at any size. */
export function useWidth(): [number, React.RefCallback<HTMLElement>] {
    const [width, setWidth] = React.useState(0);
    const ref = React.useCallback((node: HTMLElement | null) => {
        if (!node) {
            return;
        }
        const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    return [width, ref];
}

/**
 * Whether the band is pinned over scrolled content: its sentinel, just above
 * it, has left the scroll container's view. The band shows its edge only then.
 */
export function useIsStuck(): [boolean, React.RefCallback<HTMLElement>] {
    const [isStuck, setIsStuck] = React.useState(false);
    const ref = React.useCallback((node: HTMLElement | null) => {
        if (!node) {
            return;
        }
        const observer = new IntersectionObserver(([entry]) =>
            setIsStuck(entry ? !entry.isIntersecting : false)
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    return [isStuck, ref];
}
