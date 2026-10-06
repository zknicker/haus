import { ChainOfThought, TextShimmer } from '@heroui-pro/react';
import type { IconSvgElement } from '@hugeicons/react';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { cn } from '../../lib/utils.ts';
import { formatTraceDuration } from './turn-trace-duration.ts';
import { useTurnTraceScope } from './turn-trace-scope.tsx';
import type { TurnTraceLane, TurnTraceTiming } from './turn-trace-timing.ts';
import type { TurnTraceStatus } from './turn-trace-tool-model.ts';

/** How a row's waterfall bar reads: the step's status, or parallel when it shared time. */
export type TraceBarTone = TurnTraceStatus | 'parallel';

export interface TraceBar {
    readonly lane?: TurnTraceLane | null;
    readonly timing: TurnTraceTiming;
    readonly tone: TraceBarTone;
}

/**
 * A row that only states what happened: one line, no disclosure, no tab stop.
 * The right-hand timing column lines up with every other row at any depth.
 */
export function TraceRow({
    children,
    timing,
}: {
    children: React.ReactNode;
    timing?: React.ReactNode;
}) {
    return (
        <div className="flex min-h-8 min-w-0 items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 flex-1">{children}</span>
            {timing}
        </div>
    );
}

/**
 * Where everything a row opens to sits: on the row's label column, behind one
 * edge that drops from its icon. The label sits 4.5 spacing steps in (the
 * icon, which hangs half a step out, and its gap); the stock body pads two,
 * so the edge's 1px and 2.5 steps less that pixel land on the label. Each
 * depth is that one step, so a nested row's own body is one step further in.
 */
const traceBodyClass =
    'grid min-w-0 gap-2 border-default border-s ps-[calc(var(--spacing)*2.5-1px)] pb-2';

/**
 * A row that opens to its evidence. The row is stock ChainOfThought: its
 * trigger is the one tab stop, and it shimmers while the step runs. The body
 * mounts on first open, so a long turn pays only for what someone reads.
 */
export function TraceDisclosure({
    children,
    defaultExpanded = false,
    isRunning = false,
    line,
    timing,
}: {
    children: React.ReactNode;
    defaultExpanded?: boolean;
    isRunning?: boolean;
    line: React.ReactNode;
    timing?: React.ReactNode;
}) {
    const [expanded, setExpanded] = React.useState(defaultExpanded);
    const [opened, setOpened] = React.useState(defaultExpanded);

    return (
        <ChainOfThought
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3"
            isExpanded={expanded}
            isStreaming={isRunning}
            onExpandedChange={(next) => {
                setExpanded(next);
                if (next) {
                    setOpened(true);
                }
            }}
        >
            <ChainOfThought.Trigger className="max-w-full">{line}</ChainOfThought.Trigger>
            {timing ?? <span />}
            <ChainOfThought.Content className="col-span-full min-w-0">
                {opened ? <div className={traceBodyClass}>{children}</div> : null}
            </ChainOfThought.Content>
        </ChainOfThought>
    );
}

/**
 * Icon, label, the muted place it happened, and any trailing fact. On a
 * narrow trace the meta gives way first, then the directory; the label and
 * an alert keep their width.
 */
export function TraceLine({
    alert,
    detail,
    icon,
    isQuiet = false,
    isRunning = false,
    label,
    meta,
    tone = 'muted',
}: {
    /** A count that must survive any width, in danger: `2 failed`. */
    alert?: string | null;
    detail?: string | null;
    icon: IconSvgElement;
    isQuiet?: boolean;
    isRunning?: boolean;
    label: string;
    meta?: React.ReactNode;
    tone?: 'danger' | 'muted' | 'warning';
}) {
    return (
        <span className="flex min-w-0 items-center gap-2 text-left">
            <Icon
                className={cn(
                    'size-3.5 shrink-0',
                    tone === 'danger' && 'text-danger',
                    tone === 'warning' && 'text-warning',
                    tone === 'muted' && 'text-muted'
                )}
                icon={icon}
            />
            {/* A running label leaves its colour to the shimmer around it. */}
            <span className={cn('min-w-0 truncate', !(isRunning || isQuiet) && 'text-foreground')}>
                {label}
            </span>
            {detail ? (
                <span className="min-w-0 shrink-[4] truncate text-muted">{detail}</span>
            ) : null}
            {meta ? (
                <span className="min-w-0 shrink-[8] truncate text-muted tabular-nums">{meta}</span>
            ) : null}
            {alert ? <span className="shrink-0 text-danger tabular-nums">{alert}</span> : null}
        </span>
    );
}

/** A plain row's running label shimmers the way a disclosure row's trigger does. */
export function TraceShimmer({
    children,
    isRunning,
}: {
    children: React.ReactNode;
    isRunning: boolean;
}) {
    return isRunning ? <TextShimmer className="min-w-0">{children}</TextShimmer> : children;
}

/**
 * The timing column: a thin waterfall bar on the turn's own axis, then the
 * duration in tabular figures. Parallel members draw as stacked lanes in one
 * bar, so steps that ran side by side read that way. The bar yields first on
 * a narrow trace; the duration always stays.
 */
export function TraceTiming({
    bars,
    showSubsecond = false,
    timing,
}: {
    bars: readonly TraceBar[];
    showSubsecond?: boolean;
    timing: TurnTraceTiming;
}) {
    const { axisMs } = useTurnTraceScope();
    const duration = formatTraceDuration(timing.durationMs, {
        isRunning: timing.isRunning,
        showSubsecond,
    });

    return (
        <span className="flex shrink-0 items-center gap-3">
            <span aria-hidden className="relative @md:block hidden h-2.5 w-24">
                {axisMs > 0
                    ? bars.map((bar, index) => (
                          <span
                              className={cn('absolute min-w-0.5 rounded-full', barTones[bar.tone])}
                              // biome-ignore lint/suspicious/noArrayIndexKey: bars never reorder within one row.
                              key={index}
                              style={placeBar(bar, axisMs)}
                          />
                      ))
                    : null}
            </span>
            <span className="w-14 text-end text-muted text-sm tabular-nums">{duration}</span>
        </span>
    );
}

const barTones: Record<TraceBarTone, string> = {
    completed: 'bg-muted/40',
    failed: 'bg-danger',
    interrupted: 'bg-muted/40',
    parallel: 'bg-accent/60',
    running: 'bg-accent',
    warning: 'bg-warning',
};

function placeBar(bar: TraceBar, axisMs: number): React.CSSProperties {
    const left = Math.min(100, (bar.timing.offsetMs / axisMs) * 100);
    const width = Math.min(100 - left, ((bar.timing.durationMs ?? 0) / axisMs) * 100);
    const lanes = bar.lane?.lanes ?? 1;
    const lane = bar.lane && lanes > 1 ? bar.lane.lane : 0;
    return {
        height: lanes > 1 ? `calc(${100 / lanes}% - 1px)` : '4px',
        left: `${left}%`,
        top: lanes > 1 ? `${(lane / lanes) * 100}%` : 'calc(50% - 2px)',
        width: `${width}%`,
    };
}
