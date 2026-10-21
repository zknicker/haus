import type { AgentHeartbeats } from '@haus/api';
import { Tooltip } from '@heroui/react';
import {
    formatPercent,
    type PlanMeter,
    readPlanMeter,
    readSummaryFacts,
} from './heartbeats-model.ts';

/**
 * The day in one dense strip, on the log overview's text scale: how many
 * heartbeats ran and how they ended, what came of them, and a compact meter per
 * plan showing weekly use with the heartbeat and dream share cut from it.
 */
export function HeartbeatSummary({ summary }: { summary: AgentHeartbeats['summary'] }) {
    const facts = readSummaryFacts(summary);
    return (
        <section
            aria-label="Heartbeat summary"
            className="flex flex-wrap items-center gap-x-4 gap-y-1 border-separator border-b px-(--trace-pad) py-1.5 text-muted text-sm tabular-nums"
        >
            <Facts facts={facts.outcomes} />
            <Facts facts={facts.results} />
            {summary.plans.length > 0 ? (
                <span className="ms-auto flex flex-wrap items-center gap-x-4 gap-y-1">
                    {summary.plans.map((plan) => (
                        <PlanMeterBar key={plan.runtimeId} meter={readPlanMeter(plan)} />
                    ))}
                </span>
            ) : null}
        </section>
    );
}

function Facts({ facts }: { facts: readonly string[] }) {
    return (
        <p>
            {facts.map((fact, index) => (
                <span key={fact}>
                    {index > 0 ? ' · ' : null}
                    <FactText fact={fact} isLead={index === 0} />
                </span>
            ))}
        </p>
    );
}

/** The count reads at foreground weight; its noun stays muted. */
function FactText({ fact, isLead }: { fact: string; isLead: boolean }) {
    const [count = '', ...rest] = fact.split(' ');
    return (
        <>
            <span className={isLead ? 'font-medium text-foreground' : 'text-foreground'}>
                {count}
            </span>
            {rest.length > 0 ? ` ${rest.join(' ')}` : null}
        </>
    );
}

function PlanMeterBar({ meter }: { meter: PlanMeter }) {
    return (
        <Tooltip delay={0}>
            <Tooltip.Trigger>
                <button
                    className="flex cursor-default items-center gap-2 rounded-xs text-xs outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    type="button"
                >
                    <span>{meter.label}</span>
                    <span
                        aria-hidden
                        className="flex h-1.5 w-24 overflow-hidden rounded-full bg-default"
                    >
                        <Segment className="bg-muted/50" percent={meter.other} />
                        <Segment className="bg-accent" percent={meter.heartbeat} />
                        <Segment className="bg-accent/50" percent={meter.dream} />
                    </span>
                    <span className="text-foreground">{formatPercent(meter.used)}</span>
                </button>
            </Tooltip.Trigger>
            <Tooltip.Content>{meter.tooltip}</Tooltip.Content>
        </Tooltip>
    );
}

function Segment({ className, percent }: { className: string; percent: number }) {
    return percent > 0 ? <span className={className} style={{ width: `${percent}%` }} /> : null;
}
