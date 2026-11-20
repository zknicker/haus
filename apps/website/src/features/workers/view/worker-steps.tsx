import type { WorkerStep } from '@haus/api';
import { ChainOfThought } from '@heroui-pro/react';
import { ChatTool } from '@heroui-pro/react/chat-tool';
import { CompactCodeBlock } from '../../../components/code/compact-code-block.tsx';
import { formatWorkerDuration } from '../worker-presentation.ts';

const verbs = { edit: 'Edited', read: 'Read', run: 'Ran', search: 'Searched' } as const;
const toolStates = {
    done: 'output-available',
    failed: 'output-error',
    running: 'input-available',
} as const;

export function WorkerSteps({
    live,
    span,
    steps,
}: {
    live: boolean;
    span: null | number;
    steps: readonly WorkerStep[];
}) {
    const count = `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`;
    const title = live
        ? `Working · ${count}`
        : span === null
          ? count
          : `Worked for ${formatWorkerDuration(span)} · ${count}`;
    return (
        <ChainOfThought defaultExpanded={false} isStreaming={live}>
            <ChainOfThought.Trigger>{title}</ChainOfThought.Trigger>
            <ChainOfThought.Content>
                <ChainOfThought.Steps>
                    {steps.map((step, index) => (
                        <ChainOfThought.Step key={`${step.kind}:${step.label}:${index}`}>
                            <WorkerStepTool step={step} />
                        </ChainOfThought.Step>
                    ))}
                </ChainOfThought.Steps>
            </ChainOfThought.Content>
        </ChainOfThought>
    );
}

function WorkerStepTool({ step }: { step: WorkerStep }) {
    return (
        <ChatTool defaultExpanded={false} state={toolStates[step.state]} toolName={step.label}>
            <ChatTool.Trigger>
                <ChatTool.StatusIcon />
                {`${verbs[step.kind]} `}
                <strong>{step.label}</strong>
                {step.additions ? (
                    <span className="text-success">{` +${step.additions}`}</span>
                ) : null}
                {step.deletions ? (
                    <span className="text-danger">{` −${step.deletions}`}</span>
                ) : null}
            </ChatTool.Trigger>
            {step.output ? (
                <ChatTool.Content>
                    <CompactCodeBlock
                        code={step.output}
                        copyLabel="Copy output"
                        label="Output"
                        language="text"
                    />
                </ChatTool.Content>
            ) : null}
        </ChatTool>
    );
}
