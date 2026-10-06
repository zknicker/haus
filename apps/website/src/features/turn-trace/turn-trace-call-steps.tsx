import { Task01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { hasCallBody, TurnTraceCallBody } from './turn-trace-call-body.tsx';
import { type TraceBar, TraceBody, TraceNested } from './turn-trace-grid.tsx';
import { traceMark } from './turn-trace-icons.ts';
import { TurnTraceImagePreview } from './turn-trace-image.tsx';
import { TraceDisclosure, TraceLine, TraceRow } from './turn-trace-row.tsx';
import type {
    TurnTraceCallStep,
    TurnTraceFoldStep,
    TurnTraceHausStep,
} from './turn-trace-step-types.ts';

/**
 * One call. A row with evidence opens to it; a row without stays a plain
 * line. A failure tints its row and opens on its own because it is why
 * someone opened the trace; an image shows what it made in place.
 */
export function TraceCallStep({ step }: { step: TurnTraceCallStep }) {
    const { status, timing, tool } = step;
    const mark = traceMark(tool.kind, status, tool.image?.media ?? null);
    // Settled bookkeeping reads as Haus upkeep: the muted Haus mark, not the tool's.
    const isQuiet = tool.isBookkeeping && (status === 'completed' || status === 'running');
    const cells = {
        bars: [
            {
                kind: isQuiet ? 'quiet' : 'tool',
                lane: step.parallel,
                status,
                timing,
            } satisfies TraceBar,
        ],
        line: (
            <TraceLine
                detail={tool.target?.dir || null}
                icon={isQuiet ? Task01Icon : mark.icon}
                isQuiet={isQuiet}
                isRunning={timing.isRunning}
                label={step.label}
                meta={tool.extraCommands > 0 ? `+${tool.extraCommands} more` : null}
                tone={mark.tone}
            />
        ),
        timing,
        tone: status === 'failed' ? ('danger' as const) : ('default' as const),
    };

    if (tool.image && status !== 'failed') {
        return (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
                <TraceRow {...cells} />
                <TraceBody>
                    <TurnTraceImagePreview image={tool.image} />
                </TraceBody>
            </div>
        );
    }
    if (!hasCallBody(tool)) {
        return <TraceRow {...cells} />;
    }
    return (
        <TraceDisclosure {...cells} defaultExpanded={status === 'failed'}>
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
    const bars: TraceBar[] = step.isParallel
        ? step.members.map((member) => ({
              kind: 'tool',
              lane: member.parallel,
              status: member.status === 'running' ? 'running' : 'completed',
              timing: member.timing,
          }))
        : [{ kind: 'tool', lane: step.parallel, status: step.status, timing: step.timing }];

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
                kind: 'quiet',
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
        <TraceNested>
            <TraceStack>
                {members.map((member) => (
                    <TraceCallStep key={member.key} step={member} />
                ))}
            </TraceStack>
        </TraceNested>
    );
}

/** A list of rows. Rows carry their own 32px line, so the list adds only a hairline gap. */
export function TraceStack({ children }: { children: React.ReactNode }) {
    return <div className="grid min-w-0 gap-px">{children}</div>;
}
