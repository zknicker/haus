import { BrainIcon, BubbleChatIcon } from '@hugeicons-pro/core-stroke-rounded';
import { AnimatePresence } from 'motion/react';
import * as React from 'react';
import { formatAgentActivityEvent } from '../members/agent-profile/agent-activity-model.ts';
import {
    TraceCallStep,
    TraceFoldStep,
    TraceHausStep,
    TraceStack,
} from './turn-trace-call-steps.tsx';
import { TraceBody, TraceNested, traceTextInset, useTraceDepthStyle } from './turn-trace-grid.tsx';
import { TurnTraceReasoning } from './turn-trace-reasoning.tsx';
import { TurnTraceReveal } from './turn-trace-reveal.tsx';
import { TraceDisclosure, TraceLine, TraceRow } from './turn-trace-row.tsx';
import type { TurnTraceStep, TurnTraceThoughtStep } from './turn-trace-step-types.ts';
import { TraceSubagentStep } from './turn-trace-subagent-step.tsx';

/**
 * The trace's steps on one grid, in order. A step a live turn adds fades and
 * rises into place; a reasoning title the Agent wrote before a step rides it
 * as a caption. Nested steps (a sub-agent's own calls) sit one depth in on
 * the same columns.
 */
export function TurnTraceSteps({
    isNested = false,
    steps,
}: {
    isNested?: boolean;
    steps: readonly TurnTraceStep[];
}) {
    const list = (
        <TraceStack>
            <AnimatePresence initial={false}>
                {steps.map((step) => (
                    <TurnTraceReveal
                        className="min-w-0"
                        data-trace-anchor={step.key}
                        key={step.key}
                    >
                        <CaptionedStep step={step}>
                            <TurnTraceStepView step={step} />
                        </CaptionedStep>
                    </TurnTraceReveal>
                ))}
            </AnimatePresence>
        </TraceStack>
    );
    return isNested ? <TraceNested>{list}</TraceNested> : list;
}

function TurnTraceStepView({ step }: { step: TurnTraceStep }) {
    switch (step.kind) {
        case 'call':
            return <TraceCallStep step={step} />;
        case 'fold':
            return <TraceFoldStep step={step} />;
        case 'haus':
            return <TraceHausStep step={step} />;
        case 'subagent':
            return (
                <TraceSubagentStep step={step}>
                    {step.children.length > 0 ? (
                        <TurnTraceSteps isNested steps={step.children} />
                    ) : null}
                </TraceSubagentStep>
            );
        case 'reasoning':
            return (
                <TurnTraceReasoning
                    isStreaming={step.isStreaming}
                    reasoning={step.reasoning}
                    timing={step.timing}
                />
            );
        case 'thought':
            return <TraceThoughtStep step={step} />;
        case 'event':
            return (
                <TraceRow
                    bars={[]}
                    line={
                        <TraceLine
                            icon={BubbleChatIcon}
                            isQuiet
                            label={formatAgentActivityEvent(step.event)}
                        />
                    }
                />
            );
        default:
            return null;
    }
}

/** Title-only reasoning with no step after it yet: the live "thinking" line, or the closing thought. */
function TraceThoughtStep({ step }: { step: TurnTraceThoughtStep }) {
    const earlier = step.thoughts.slice(0, -1);
    const line = (
        <TraceLine
            icon={BrainIcon}
            isQuiet
            isRunning={step.isStreaming}
            label={step.caption ?? 'Thinking'}
            meta={earlier.length > 0 ? `${step.thoughts.length} thoughts` : null}
        />
    );
    if (earlier.length === 0) {
        return <TraceRow bars={[]} line={line} />;
    }
    return (
        <TraceDisclosure bars={[]} line={line}>
            <TraceBody>
                <ThoughtList thoughts={earlier} />
            </TraceBody>
        </TraceDisclosure>
    );
}

/**
 * The reasoning titles the Agent wrote before a step, as that step's muted
 * caption on its label text. Several read as the latest one; the earlier ones
 * are a press away, at the same weight. The step's children keep one position
 * whether or not a caption is present: a live fold that gains a captioned
 * member must not remount its row, or the row forgets it was open.
 */
function CaptionedStep({ children, step }: { children: React.ReactNode; step: TurnTraceStep }) {
    const [expanded, setExpanded] = React.useState(false);
    const listId = React.useId();
    const depthStyle = useTraceDepthStyle();
    // A thought step is its own caption.
    const caption = step.kind === 'thought' ? null : step.caption;
    const earlier = caption ? step.thoughts.slice(0, -1) : [];

    return (
        <div className="grid min-w-0">
            {caption ? (
                <div
                    className="grid min-w-0 justify-items-start gap-0.5 pe-2 pt-1 text-muted text-sm"
                    data-trace-caption
                    style={{
                        ...depthStyle,
                        paddingInlineStart: traceTextInset,
                    }}
                >
                    {earlier.length > 0 ? (
                        <button
                            aria-controls={listId}
                            aria-expanded={expanded}
                            className="cursor-(--cursor-interactive) text-left hover:text-foreground"
                            onClick={() => setExpanded((current) => !current)}
                            type="button"
                        >
                            {`${caption} · ${step.thoughts.length} thoughts`}
                        </button>
                    ) : (
                        <span>{caption}</span>
                    )}
                    {earlier.length > 0 ? (
                        <ThoughtList hidden={!expanded} id={listId} thoughts={earlier} />
                    ) : null}
                </div>
            ) : null}
            {children}
        </div>
    );
}

function ThoughtList({
    hidden = false,
    id,
    thoughts,
}: {
    hidden?: boolean;
    id?: string;
    thoughts: readonly string[];
}) {
    return (
        <ul className="grid gap-0.5 text-muted text-sm" hidden={hidden} id={id}>
            {thoughts.map((thought, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: thoughts are append-only.
                <li key={index}>{thought}</li>
            ))}
        </ul>
    );
}
