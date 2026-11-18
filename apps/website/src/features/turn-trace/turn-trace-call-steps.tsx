import { Task01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { hasCallBody, TurnTraceCallBody } from './turn-trace-call-body.tsx';
import { TraceElbow, TraceGroup, TraceNested, traceBranchClass } from './turn-trace-depth.tsx';
import { type TraceBar, TraceBody } from './turn-trace-grid.tsx';
import { traceMark } from './turn-trace-icons.ts';
import { TurnTraceImagePreview } from './turn-trace-image.tsx';
import { isQuietCall, traceToolKind } from './turn-trace-kind.ts';
import { TraceDisclosure, TraceLine, TraceRow } from './turn-trace-row.tsx';
import type {
    TurnTraceCallStep,
    TurnTraceFoldStep,
    TurnTraceHausStep,
} from './turn-trace-step-types.ts';

/**
 * One call. A row with evidence opens to it; a row without stays a plain
 * line. A failure tints its row and stays closed until someone opens it; an
 * image opens to what it made.
 */
export function TraceCallStep({ step }: { step: TurnTraceCallStep }) {
    const { status, timing, tool } = step;
    const mark = traceMark(tool.kind, status, tool.image?.media ?? null);
    // Settled bookkeeping reads as Haus upkeep: the muted Haus mark, not the tool's.
    const isQuiet = isQuietCall(tool.isBookkeeping, status);
    const cells = {
        bars: [
            {
                kind: isQuiet ? 'haus' : traceToolKind(tool.kind),
                lane: step.parallel,
                status,
                timing,
            } satisfies TraceBar,
        ],
        line: (
            <TraceLine
                detail={tool.target?.dir || tool.detail}
                icon={isQuiet ? Task01Icon : mark.icon}
                isQuiet={isQuiet}
                isRunning={timing.isRunning}
                label={step.label}
                meta={tool.extraCommands > 0 ? `+${tool.extraCommands} more` : null}
                tone={isQuiet ? 'muted' : mark.tone}
            />
        ),
        timing,
        tone: status === 'failed' ? ('danger' as const) : ('default' as const),
    };

    if (tool.image && status !== 'failed') {
        return (
            <TraceDisclosure {...cells}>
                <TraceBody>
                    <TurnTraceImagePreview image={tool.image} />
                </TraceBody>
            </TraceDisclosure>
        );
    }
    if (!hasCallBody(tool)) {
        return <TraceRow {...cells} />;
    }
    return (
        <TraceDisclosure {...cells}>
            <TraceBody>
                <TurnTraceCallBody tool={tool} />
            </TraceBody>
        </TraceDisclosure>
    );
}

/**
 * Same-kind calls in a row, folded: `Read 3 files`. Members that ran side by
 * side draw as stacked lanes in the fold's one bar.
 */
export function TraceFoldStep({ step }: { step: TurnTraceFoldStep }) {
    const mark = traceMark(step.toolKind, step.status);
    const kind = traceToolKind(step.toolKind);
    const bars: TraceBar[] = step.isParallel
        ? step.members.map((member) => ({
              kind,
              lane: member.parallel,
              status: member.status === 'running' ? 'running' : 'completed',
              timing: member.timing,
          }))
        : [{ kind, lane: step.parallel, status: step.status, timing: step.timing }];

    return (
        <TraceDisclosure
            bars={bars}
            line={
                <TraceLine
                    icon={mark.icon}
                    isRunning={step.timing.isRunning}
                    label={step.label}
                    meta={step.isParallel ? 'in parallel' : null}
                    tone={mark.tone}
                />
            }
            timing={step.timing}
        >
            <TraceMembers members={step.members} />
        </TraceDisclosure>
    );
}

/** The Agent's Haus bookkeeping when it made several calls, one muted row for the whole turn. */
export function TraceHausStep({ step }: { step: TurnTraceHausStep }) {
    return (
        <TraceDisclosure
            bars={step.members.map((member) => ({
                kind: 'haus',
                status: member.status,
                timing: member.timing,
            }))}
            line={
                <TraceLine
                    icon={Task01Icon}
                    isQuiet
                    isRunning={step.timing.isRunning}
                    label={step.label}
                    meta={`${step.members.length} steps`}
                />
            }
            timing={step.timing}
        >
            <TraceMembers members={step.members} />
        </TraceDisclosure>
    );
}

/** A fold's members: rows one depth in, on the same columns as the fold. */
function TraceMembers({ members }: { members: readonly TurnTraceCallStep[] }) {
    return (
        <TraceGroup>
            <TraceNested>
                <TraceStack>
                    {members.map((member) => (
                        <div className={traceBranchClass} key={member.key}>
                            <TraceCallStep step={member} />
                            <TraceElbow at="row" />
                        </div>
                    ))}
                </TraceStack>
            </TraceNested>
        </TraceGroup>
    );
}

/** A list of rows. Rows carry their own 32px line, so the list adds only a hairline gap. */
export function TraceStack({ children }: { children: React.ReactNode }) {
    return <div className="grid min-w-0 gap-px">{children}</div>;
}
