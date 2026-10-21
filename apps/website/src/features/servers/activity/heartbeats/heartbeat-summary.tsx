import type { AgentHeartbeats } from '@haus/api';
import { Tooltip } from '@heroui/react';
import type * as React from 'react';
import { cn } from '../../../../lib/utils.ts';
import { HeartbeatGlyph } from './heartbeat-glyph.tsx';
import { glyphLabels, readDreamTotals, readGlyphCounts } from './heartbeat-marks-model.ts';
import { formatPercent, type LaneView, type PlanMeter, readPlanMeter } from './heartbeats-model.ts';

/**
 * The day as a scoreboard: equal tiles split by hairlines, each a small label
 * over a big rounded numeral. Beats today carries its outcome glyph counts
 * (which is also the legend), then what came of them, last night's dreams, and
 * a tile per plan with a meter of weekly use cut into work, heartbeat and dream.
 */
export function HeartbeatSummary({
    lanes,
    summary,
}: {
    lanes: readonly LaneView[];
    summary: AgentHeartbeats['summary'];
}) {
    const dreams = readDreamTotals(lanes);
    return (
        <section
            aria-label="Heartbeat summary"
            className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-px border-separator border-b bg-separator tabular-nums"
        >
            <Tile label="Beats today" qualifier="runs" value={summary.runs}>
                <ul className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    {readGlyphCounts(lanes).map(({ count, kind }) => (
                        <li key={kind}>
                            <Tooltip delay={0}>
                                <Tooltip.Trigger>
                                    <button
                                        aria-label={`${glyphLabels[kind]}: ${count}`}
                                        className="flex cursor-default items-center gap-1 rounded-xs text-muted text-xs outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                        type="button"
                                    >
                                        <HeartbeatGlyph kind={kind} size={16} />
                                        {count}
                                    </button>
                                </Tooltip.Trigger>
                                <Tooltip.Content>{glyphLabels[kind]}</Tooltip.Content>
                            </Tooltip>
                        </li>
                    ))}
                </ul>
            </Tile>
            <Tile
                label="Came of it"
                qualifier={summary.posts === 1 ? 'post' : 'posts'}
                value={summary.posts}
            >
                <Sub>
                    {summary.rulesLearned} {summary.rulesLearned === 1 ? 'rule' : 'rules'} learned ·{' '}
                    {summary.followUps} {summary.followUps === 1 ? 'follow-up' : 'follow-ups'}
                </Sub>
            </Tile>
            <Tile
                label="Last night"
                qualifier={dreams.dreams === 1 ? 'dream' : 'dreams'}
                value={dreams.dreams}
            >
                <Sub>
                    {dreams.lessons} {dreams.lessons === 1 ? 'lesson' : 'lessons'} ·{' '}
                    {dreams.promises} {dreams.promises === 1 ? 'promise' : 'promises'}
                </Sub>
            </Tile>
            {summary.plans.map((plan) => (
                <PlanTile key={plan.runtimeId} meter={readPlanMeter(plan)} />
            ))}
        </section>
    );
}

function Tile({
    children,
    label,
    qualifier,
    value,
}: {
    children?: React.ReactNode;
    label: string;
    qualifier: string;
    value: number | string;
}) {
    const isZero = value === 0 || value === '0%';
    return (
        <div className="grid min-w-0 content-start gap-1.5 bg-background px-(--trace-pad) py-3">
            <span className="text-muted text-xs uppercase tracking-wide">{label}</span>
            <span className="flex items-baseline gap-1.5">
                <span
                    className={cn(
                        'font-bold font-numeral text-2xl leading-none',
                        isZero && 'text-muted'
                    )}
                >
                    {value}
                </span>
                <span className="text-muted text-xs">{qualifier}</span>
            </span>
            {children}
        </div>
    );
}

function Sub({ children }: { children: React.ReactNode }) {
    return <span className="text-muted text-xs">{children}</span>;
}

function PlanTile({ meter }: { meter: PlanMeter }) {
    return (
        <Tile
            label={meter.label}
            qualifier="of week"
            value={formatPercent(meter.heartbeat + meter.dream)}
        >
            <Tooltip delay={0}>
                <Tooltip.Trigger>
                    <button
                        className="grid cursor-default gap-1 rounded-xs text-start outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        type="button"
                    >
                        <span
                            aria-hidden
                            className="flex h-2 overflow-hidden rounded-full bg-default"
                        >
                            <Segment className="bg-muted/40" percent={meter.other} />
                            <Segment className="bg-accent" percent={meter.heartbeat} />
                            <Segment className="bg-dream" percent={meter.dream} />
                        </span>
                        <Sub>{formatPercent(meter.used)} used overall</Sub>
                    </button>
                </Tooltip.Trigger>
                <Tooltip.Content>{meter.tooltip}</Tooltip.Content>
            </Tooltip>
        </Tile>
    );
}

function Segment({ className, percent }: { className: string; percent: number }) {
    return percent > 0 ? <span className={className} style={{ width: `${percent}%` }} /> : null;
}
