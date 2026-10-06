import { ChainOfThought } from '@heroui-pro/react';
import { BrainIcon, BubbleChatIcon } from '@hugeicons-pro/core-stroke-rounded';
import { AnimatePresence } from 'motion/react';
import * as React from 'react';
import { formatAgentActivityEvent } from '../members/agent-profile/agent-activity-model.ts';
import { TurnTraceFact, TurnTraceNote } from './turn-trace-blocks.tsx';
import { TraceFailure } from './turn-trace-call-body.tsx';
import {
    TraceCallStep,
    TraceFoldStep,
    TraceHausStep,
    TraceRail,
} from './turn-trace-call-steps.tsx';
import { traceMark } from './turn-trace-icons.ts';
import { TurnTraceMarkdown, TurnTraceReasoning } from './turn-trace-reasoning.tsx';
import { TurnTraceReveal } from './turn-trace-reveal.tsx';
import {
    TraceDisclosure,
    TraceLine,
    TraceRow,
    TraceShimmer,
    TraceTiming,
} from './turn-trace-row.tsx';
import type {
    TurnTraceStep,
    TurnTraceSubagentStep,
    TurnTraceThoughtStep,
} from './turn-trace-step-types.ts';
import { formatSubagentMeta } from './turn-trace-subagent.ts';

/**
 * The trace's steps on one rail, in order. A step a live turn adds grows into
 * place; a reasoning title the Agent wrote before a step rides it as a caption.
 */
export function TurnTraceSteps({ steps }: { steps: readonly TurnTraceStep[] }) {
    return (
        <TraceRail>
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
        </TraceRail>
    );
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
                    {step.children.length > 0 ? <TurnTraceSteps steps={step.children} /> : null}
                </TraceSubagentStep>
            );
        case 'reasoning':
            return (
                <TurnTraceReasoning
                    isStreaming={step.isStreaming}
                    reasoning={step.reasoning}
                    timing={<TraceTiming bars={[]} timing={step.timing} />}
                />
            );
        case 'thought':
            return <TraceThoughtStep step={step} />;
        case 'event':
            return (
                <TraceRow>
                    <TraceLine
                        icon={BubbleChatIcon}
                        isQuiet
                        label={formatAgentActivityEvent(step.event)}
                    />
                </TraceRow>
            );
        default:
            return null;
    }
}

/**
 * A sub-agent is a row like any call, with its own calls nested on the rail
 * inside it. It states how many of them failed even when it finished, and its
 * report reads as the prose it is.
 */
function TraceSubagentStep({
    children,
    step,
}: {
    children: React.ReactNode;
    step: TurnTraceSubagentStep;
}) {
    const { status, timing, tool } = step;
    const mark = traceMark('subagent', status);
    const meta = formatSubagentMeta(tool.source, tool.children.length);
    const latestAction =
        tool.children.length === 0 && status === 'running'
            ? (tool.source.subagent?.latestAction ?? null)
            : null;

    return (
        <TraceDisclosure
            defaultExpanded={status === 'failed'}
            isRunning={timing.isRunning}
            line={
                <TraceLine
                    alert={tool.failedChildCount > 0 ? `${tool.failedChildCount} failed` : null}
                    icon={mark.icon}
                    isRunning={timing.isRunning}
                    label={step.label}
                    meta={meta || null}
                    tone={mark.tone}
                />
            }
            timing={
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
            }
        >
            {tool.failure ? <TraceFailure failure={tool.failure} /> : null}
            {tool.source.subagent?.subagentType ? (
                <TurnTraceFact label="Type" value={tool.source.subagent.subagentType} />
            ) : null}
            {children}
            {latestAction ? <TurnTraceNote>{latestAction}</TurnTraceNote> : null}
            {tool.interruption ? <TurnTraceNote>{tool.interruption}</TurnTraceNote> : null}
            {tool.report ? <TurnTraceMarkdown content={tool.report} /> : null}
        </TraceDisclosure>
    );
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
        return (
            <TraceRow>
                <TraceShimmer isRunning={step.isStreaming}>{line}</TraceShimmer>
            </TraceRow>
        );
    }
    return (
        <TraceDisclosure isRunning={step.isStreaming} line={line}>
            <ThoughtList thoughts={earlier} />
        </TraceDisclosure>
    );
}

/**
 * The reasoning titles the Agent wrote before a step, as that step's muted
 * caption. Several read as the latest one; the earlier ones are a press away,
 * at the same weight.
 */
function CaptionedStep({ children, step }: { children: React.ReactNode; step: TurnTraceStep }) {
    const [expanded, setExpanded] = React.useState(false);
    const listId = React.useId();
    // A thought step is its own caption.
    if (step.kind === 'thought' || !step.caption) {
        return <ChainOfThought.Step>{children}</ChainOfThought.Step>;
    }
    const earlier = step.thoughts.slice(0, -1);
    const label =
        earlier.length === 0 ? (
            step.caption
        ) : (
            <button
                aria-controls={listId}
                aria-expanded={expanded}
                className="cursor-(--cursor-interactive) text-left hover:text-foreground"
                onClick={() => setExpanded((current) => !current)}
                type="button"
            >
                {`${step.caption} · ${step.thoughts.length} thoughts`}
            </button>
        );

    return (
        <ChainOfThought.Step label={label}>
            {earlier.length > 0 ? (
                <ThoughtList hidden={!expanded} id={listId} thoughts={earlier} />
            ) : null}
            {children}
        </ChainOfThought.Step>
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
