import type { AgentHeartbeats } from '@haus/api';
import { Tooltip } from '@heroui/react';
import type * as React from 'react';
import { cn } from '../../../../lib/utils.ts';
import { HeartbeatGlyph } from './heartbeat-glyph.tsx';
import { glyphLabels, readGlyphCounts } from './heartbeat-marks-model.ts';
import {
    formatPercent,
    type LaneView,
    type PlanMeter,
    readPlanMeter,
    readSummaryResults,
} from './heartbeats-model.ts';

/**
 * The day in a few separated stat groups: how many heartbeats ran with their
 * outcomes as glyph counts (which is also the legend), what came of them, and
 * a meter per plan showing weekly use with the heartbeat and dream share cut
 * from it. Each group is a muted label over its value; whitespace separates.
 */
export function HeartbeatSummary({
    lanes,
    summary,
}: {
    lanes: readonly LaneView[];
    summary: AgentHeartbeats['summary'];
}) {
    return (
        <section
            aria-label="Heartbeat summary"
            className="flex flex-wrap items-start gap-x-8 gap-y-3 border-separator border-b px-(--trace-pad) py-3 tabular-nums"
        >
            <Stat label="Heartbeats">
                <span className="font-semibold text-base leading-5">{summary.runs}</span>
                <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {readGlyphCounts(lanes).map(({ count, kind }) => (
                        <li key={kind}>
                            <Tooltip delay={0}>
                                <Tooltip.Trigger>
                                    <button
                                        aria-label={`${glyphLabels[kind]}: ${count}`}
                                        className="flex cursor-default items-center gap-1.5 rounded-xs text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                        type="button"
                                    >
                                        <span className="flex size-5 items-center justify-center">
                                            <HeartbeatGlyph kind={kind} />
                                        </span>
                                        {count}
                                    </button>
                                </Tooltip.Trigger>
                                <Tooltip.Content>{glyphLabels[kind]}</Tooltip.Content>
                            </Tooltip>
                        </li>
                    ))}
                </ul>
            </Stat>
            <Stat label="Came of it">
                <ul className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    {readSummaryResults(summary).map(({ count, label }) => (
                        <li className="flex items-baseline gap-1.5" key={label}>
                            <span
                                className={cn(
                                    'font-semibold text-base leading-5',
                                    count === 0 && 'font-normal text-muted'
                                )}
                            >
                                {count}
                            </span>
                            <span className="text-muted text-xs">{label}</span>
                        </li>
                    ))}
                </ul>
            </Stat>
            {summary.plans.length > 0 ? (
                <div className="ms-auto flex flex-wrap gap-x-8 gap-y-3">
                    {summary.plans.map((plan) => (
                        <PlanMeterBar key={plan.runtimeId} meter={readPlanMeter(plan)} />
                    ))}
                </div>
            ) : null}
        </section>
    );
}

function Stat({ children, label }: { children: React.ReactNode; label: string }) {
    return (
        <div className="grid min-w-0 gap-1.5">
            <span className="text-muted text-xs">{label}</span>
            {children}
        </div>
    );
}

function PlanMeterBar({ meter }: { meter: PlanMeter }) {
    return (
        <Stat label={meter.label}>
            <Tooltip delay={0}>
                <Tooltip.Trigger>
                    <button
                        className="flex cursor-default items-center gap-2 rounded-xs text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        type="button"
                    >
                        <span
                            aria-hidden
                            className="flex h-1.5 w-28 overflow-hidden rounded-full bg-default"
                        >
                            <Segment className="bg-muted/50" percent={meter.other} />
                            <Segment className="bg-accent" percent={meter.heartbeat} />
                            <Segment className="bg-accent/50" percent={meter.dream} />
                        </span>
                        <span className="font-medium">{formatPercent(meter.used)}</span>
                    </button>
                </Tooltip.Trigger>
                <Tooltip.Content>{meter.tooltip}</Tooltip.Content>
            </Tooltip>
        </Stat>
    );
}

function Segment({ className, percent }: { className: string; percent: number }) {
    return percent > 0 ? <span className={className} style={{ width: `${percent}%` }} /> : null;
}
