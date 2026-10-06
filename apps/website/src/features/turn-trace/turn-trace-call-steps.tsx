import { ChainOfThought } from '@heroui-pro/react';
import { Task01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { hasCallBody, TurnTraceCallBody } from './turn-trace-call-body.tsx';
import { traceMark } from './turn-trace-icons.ts';
import { TurnTraceImagePreview } from './turn-trace-image.tsx';
import {
    TraceDisclosure,
    TraceLine,
    TraceRow,
    TraceShimmer,
    TraceTiming,
} from './turn-trace-row.tsx';
import type {
    TurnTraceCallStep,
    TurnTraceFoldStep,
    TurnTraceHausStep,
} from './turn-trace-step-types.ts';

/**
 * One call. A row with evidence opens to it; a row without stays a plain
 * line. A failure opens on its own because it is why someone opened the
 * trace; an image shows what it made in place.
 */
export function TraceCallStep({ step }: { step: TurnTraceCallStep }) {
    const { status, timing, tool } = step;
    const mark = traceMark(tool.kind, status, tool.image?.media ?? null);
    // Settled bookkeeping reads as Haus upkeep: the muted Haus mark, not the tool's.
    const isQuiet = tool.isBookkeeping && (status === 'completed' || status === 'running');
    const line = (
        <TraceLine
            detail={tool.target?.dir || null}
            icon={isQuiet ? Task01Icon : mark.icon}
            isQuiet={isQuiet}
            isRunning={timing.isRunning}
            label={step.label}
            meta={tool.extraCommands > 0 ? `+${tool.extraCommands} more` : null}
            tone={mark.tone}
        />
    );
    const columns = (
        <TraceTiming
            bars={[
                {
                    lane: step.parallel,
                    timing,
                    tone: step.parallel && status === 'completed' ? 'parallel' : status,
                },
            ]}
            timing={timing}
        />
    );

    if (tool.image && status !== 'failed') {
        return (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
                <TraceRow timing={columns}>
                    <TraceShimmer isRunning={timing.isRunning}>{line}</TraceShimmer>
                </TraceRow>
                <TurnTraceImagePreview image={tool.image} />
            </div>
        );
    }
    if (!hasCallBody(tool)) {
        return (
            <TraceRow timing={columns}>
                <TraceShimmer isRunning={timing.isRunning}>{line}</TraceShimmer>
            </TraceRow>
        );
    }
    return (
        <TraceDisclosure
            defaultExpanded={status === 'failed'}
            isRunning={timing.isRunning}
            line={line}
            timing={columns}
        >
            <TurnTraceCallBody tool={tool} />
        </TraceDisclosure>
    );
}

/**
 * Same-kind calls in a row, folded: `Read 3 files`. Members that ran side by
 * side draw as stacked lanes in the fold's one bar.
 */
export function TraceFoldStep({ step }: { step: TurnTraceFoldStep }) {
    const mark = traceMark(step.toolKind, step.status);
    const bars = step.isParallel
        ? step.members.map((member) => ({
              lane: member.parallel,
              timing: member.timing,
              tone: member.status === 'running' ? ('running' as const) : ('parallel' as const),
          }))
        : [{ lane: step.parallel, timing: step.timing, tone: step.status }];

    return (
        <TraceDisclosure
            isRunning={step.timing.isRunning}
            line={
                <TraceLine
                    icon={mark.icon}
                    isRunning={step.timing.isRunning}
                    label={step.label}
                    meta={step.isParallel ? 'in parallel' : null}
                    tone={mark.tone}
                />
            }
            timing={<TraceTiming bars={bars} timing={step.timing} />}
        >
            <TraceMembers members={step.members} />
        </TraceDisclosure>
    );
}

/** The Agent's Haus bookkeeping when it made several calls, one muted row for the whole turn. */
export function TraceHausStep({ step }: { step: TurnTraceHausStep }) {
    return (
        <TraceDisclosure
            isRunning={step.timing.isRunning}
            line={
                <TraceLine
                    icon={Task01Icon}
                    isQuiet
                    isRunning={step.timing.isRunning}
                    label={step.label}
                    meta={`${step.members.length} steps`}
                />
            }
            timing={<TraceTiming bars={[]} timing={step.timing} />}
        >
            <TraceMembers members={step.members} />
        </TraceDisclosure>
    );
}

function TraceMembers({ members }: { members: readonly TurnTraceCallStep[] }) {
    return (
        <TraceStack>
            {members.map((member) => (
                <ChainOfThought.Step key={member.key}>
                    <TraceCallStep step={member} />
                </ChainOfThought.Step>
            ))}
        </TraceStack>
    );
}

/**
 * Steps inside an opened row. The row's body edge already anchors them, so
 * they stack on its label column with no second rail and no second indent.
 */
export function TraceStack({ children }: { children: React.ReactNode }) {
    return <div className="grid min-w-0 gap-1">{children}</div>;
}

/**
 * The trace's one top-level rail: stock ChainOfThought steps. Rows carry
 * their own 32px line, so the rail tightens its stock step gap the way the
 * ChainOfThought agent-trace example does.
 */
export function TraceRail({ children }: { children: React.ReactNode }) {
    return <ChainOfThought.Steps className="min-w-0 gap-1">{children}</ChainOfThought.Steps>;
}
