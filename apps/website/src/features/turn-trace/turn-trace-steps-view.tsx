import { BrainIcon, BubbleChatIcon } from '@hugeicons-pro/core-stroke-rounded';
import { AnimatePresence } from 'motion/react';
import { formatAgentActivityEvent } from '../members/agent-profile/agent-activity-model.ts';
import {
    TraceCallStep,
    TraceFoldStep,
    TraceHausStep,
    TraceStack,
} from './turn-trace-call-steps.tsx';
import { type TraceBar, TraceBody, TraceNested } from './turn-trace-grid.tsx';
import { TurnTraceReasoning } from './turn-trace-reasoning.tsx';
import { TurnTraceReveal } from './turn-trace-reveal.tsx';
import { TraceDisclosure, TraceLine, TraceRow } from './turn-trace-row.tsx';
import type { TurnTraceStep, TurnTraceThoughtStep } from './turn-trace-step-types.ts';
import { TraceSubagentStep } from './turn-trace-subagent-step.tsx';

/**
 * The trace's steps on one grid, in order. A step a live turn adds fades and
 * rises into place. Nested steps (a sub-agent's own calls) sit one depth in on
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
                        <TurnTraceStepView step={step} />
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

/**
 * A run of reasoning titles reads like any reasoning row: `Thought`, with the
 * latest title as muted detail and a mark at its time. Several open to the
 * whole run, oldest first.
 */
function TraceThoughtStep({ step }: { step: TurnTraceThoughtStep }) {
    const { isStreaming, thoughts, timing } = step;
    const cells = {
        bars: [
            {
                kind: 'step',
                status: isStreaming ? 'running' : 'completed',
                timing,
            } satisfies TraceBar,
        ],
        line: (
            <TraceLine
                detail={thoughts.at(-1)}
                icon={BrainIcon}
                isQuiet
                isRunning={isStreaming}
                label="Thought"
                meta={thoughts.length > 1 ? `${thoughts.length} thoughts` : null}
            />
        ),
        timing,
    };
    if (thoughts.length < 2) {
        return <TraceRow {...cells} />;
    }
    return (
        <TraceDisclosure {...cells}>
            <TraceBody>
                <ul className="grid gap-0.5 text-muted text-sm">
                    {thoughts.map((thought, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: thoughts are append-only.
                        <li key={index}>{thought}</li>
                    ))}
                </ul>
            </TraceBody>
        </TraceDisclosure>
    );
}
